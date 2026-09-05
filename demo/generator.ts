import type {
  BankStatementRow,
  BreakType,
  DemoData,
  GroundTruthEntry,
  InternalOrder,
  RazorpayReconItem,
  SettlementBatch,
  RazorpayReconResponse,
} from '../src/types.js';

const scenarios: BreakType[] = [
  ...Array<BreakType>(50).fill('CLEAN_MATCH'),
  ...Array<BreakType>(5).fill('MDR_FEE_SPIKE'),
  ...Array<BreakType>(4).fill('GST_ROUNDING_VARIANCE'),
  ...Array<BreakType>(4).fill('REFUND_NETTED_WRONG_BATCH'),
  ...Array<BreakType>(3).fill('WEEKEND_T2_DRIFT'),
  ...Array<BreakType>(3).fill('PARTIAL_RESERVE_HOLD'),
  ...Array<BreakType>(2).fill('DUPLICATE_REFERENCE'),
  ...Array<BreakType>(2).fill('FORMAT_DRIFT'),
  'MISSING_RAZORPAY_PAYMENT',
  'AMOUNT_MISMATCH',
  'CHARGEBACK_CLAWBACK',
  'BATCH_TOTAL_MISMATCH',
];

const merchant = {
  name: 'Nila Home & Kitchen',
  city: 'Pune',
  gateway: 'Razorpay',
  bank: 'HDFC Bank',
};

const customerNames = [
  'Aditi Kulkarni',
  'Rohan Mehta',
  'Sneha Iyer',
  'Vivek Shah',
  'Neha Nair',
  'Arjun Menon',
  'Priya Deshmukh',
  'Karan Bhatia',
  'Meera Joshi',
  'Siddharth Rao',
  'Ananya Kapoor',
  'Rahul Verma',
  'Ishita Patil',
  'Manish Gupta',
  'Kavya Reddy',
  'Nikhil Jain',
];

const vendorNames = [
  'Urban Loom Supply Co.',
  'Konkan Kitchenware Traders',
  'Mango Leaf Home Goods',
  'Deccan Storage Works',
];

export function generateDemoData(seed = 42, count = 80): DemoData {
  const random = createRandom(seed);
  const internal_orders: InternalOrder[] = [];
  const razorpay_recon: RazorpayReconItem[] = [];
  const bank_statement: BankStatementRow[] = [];
  const settlement_batches: SettlementBatch[] = [];
  const ground_truth: GroundTruthEntry[] = [];
  const totals = new Map<string, number>();
  const mismatchedBatchUtrs = new Set<string>();

  for (let batchIndex = 0; batchIndex < 4; batchIndex += 1) {
    const id = `setl_DEMO_${batchIndex + 1}`;
    const utr = `HDFCDEMO${String(batchIndex + 1).padStart(4, '0')}`;
    settlement_batches.push({
      id,
      entity: 'settlement',
      amount: 0,
      status: 'processed',
      fees: 0,
      tax: 0,
      utr,
      created_at: 1788256800 + batchIndex * 86400,
    });
    totals.set(utr, 0);
  }

  for (let index = 0; index < count; index += 1) {
    const breakType = scenarios[index % scenarios.length];
    const orderId = `order_DEMO_${String(index + 1).padStart(3, '0')}`;
    const batchIndex = Math.min(Math.floor(index / 20), settlement_batches.length - 1);
    const batch = settlement_batches[batchIndex];
    const amount = (Math.floor(random() * 145) + 5) * 10000;
    const createdAt = 1788256800 + index * 1800;
    const feeRate = breakType === 'MDR_FEE_SPIKE' ? 0.032 : 0.02;
    const fee = Math.round(amount * feeRate);
    const tax = Math.round(fee * 0.18) + (breakType === 'GST_ROUNDING_VARIANCE' ? 25 : 0);
    const credit = amount - fee - tax;
    const normalizedOrderId = breakType === 'FORMAT_DRIFT' ? orderId.replace('_', '-') : orderId;
    const item: RazorpayReconItem = {
      entity_id: `pay_DEMO_${index + 1}`,
      type: 'payment',
      debit: 0,
      credit: breakType === 'PARTIAL_RESERVE_HOLD' ? Math.round(credit * 0.9) : credit,
      amount: breakType === 'AMOUNT_MISMATCH' ? amount + 100 : amount,
      currency: 'INR',
      fee,
      tax,
      on_hold: breakType === 'PARTIAL_RESERVE_HOLD',
      settled: breakType !== 'PARTIAL_RESERVE_HOLD',
      created_at: createdAt,
      settled_at: createdAt + (breakType === 'WEEKEND_T2_DRIFT' ? 259200 : 172800),
      settlement_id: batch.id,
      posted_at: null,
      credit_type: breakType === 'PARTIAL_RESERVE_HOLD' ? 'reserve' : 'default',
      description: `Payment from ${customerName(index)} for ${merchant.name}`,
      notes: `Inventory partner: ${vendorNames[index % vendorNames.length]}; ${merchant.city} fulfilment`,
      payment_id: null,
      settlement_utr: batch.utr,
      order_id: normalizedOrderId,
      order_receipt: null,
      method: breakType === 'MDR_FEE_SPIKE' ? 'card' : 'upi',
      card_network: breakType === 'MDR_FEE_SPIKE' ? 'American Express' : undefined,
      card_type: breakType === 'MDR_FEE_SPIKE' ? 'credit' : undefined,
      dispute_id: null,
    };

    const order: InternalOrder = {
      order_id: orderId,
      customer_ref: customerName(index),
      vendor_name: vendorNames[index % vendorNames.length],
      gross_amount: amount,
      status: 'paid',
      created_at: createdAt,
    };
    internal_orders.push(order);

    if (breakType !== 'MISSING_RAZORPAY_PAYMENT') {
      razorpay_recon.push(item);
      totals.set(batch.utr, (totals.get(batch.utr) ?? 0) + item.credit);
    }

    if (breakType === 'REFUND_NETTED_WRONG_BATCH') {
      const nextBatch = settlement_batches[Math.min(batchIndex + 1, settlement_batches.length - 1)];
      const refundAmount = Math.round(amount * 0.5);
      const refund: RazorpayReconItem = {
        ...item,
        entity_id: `rfnd_DEMO_${index + 1}`,
        type: 'refund',
        debit: refundAmount,
        credit: 0,
        amount: refundAmount,
        fee: 0,
        tax: 0,
        settlement_id: nextBatch.id,
        settlement_utr: nextBatch.utr,
        payment_id: item.entity_id,
        description: `Refund for ${orderId}`,
      };
      razorpay_recon.push(refund);
      totals.set(nextBatch.utr, (totals.get(nextBatch.utr) ?? 0) - refundAmount);
    }

    if (breakType === 'CHARGEBACK_CLAWBACK') {
      const chargebackAmount = Math.round(amount * 0.75);
      razorpay_recon.push({
        ...item,
        entity_id: `adj_DEMO_${index + 1}`,
        type: 'adjustment',
        debit: chargebackAmount,
        credit: 0,
        amount: chargebackAmount,
        fee: 0,
        tax: 0,
        payment_id: item.entity_id,
        description: `Chargeback clawback for ${orderId}`,
      });
      totals.set(batch.utr, (totals.get(batch.utr) ?? 0) - chargebackAmount);
    }

    if (breakType === 'BATCH_TOTAL_MISMATCH') mismatchedBatchUtrs.add(batch.utr);

    if (breakType === 'DUPLICATE_REFERENCE') {
      internal_orders.push({ ...order, created_at: createdAt + 10 });
    }

    ground_truth.push({
      record_id: orderId,
      expected_status: ['MDR_FEE_SPIKE', 'GST_ROUNDING_VARIANCE', 'REFUND_NETTED_WRONG_BATCH'].includes(breakType)
        ? 'AI_RESOLVED'
        : ['CLEAN_MATCH', 'WEEKEND_T2_DRIFT', 'FORMAT_DRIFT'].includes(breakType)
          ? 'RECONCILED'
          : 'QUARANTINED',
      break_type: breakType,
      expected_root_cause: breakType === 'MDR_FEE_SPIKE' ? 'MDR_FEE_VARIANCE' : undefined,
      notes: describeScenario(breakType),
    });
  }

  for (const batch of settlement_batches) {
    const credit = totals.get(batch.utr) ?? 0;
    batch.amount = credit;
    bank_statement.push({
      date: '2026-09-04',
      utr: batch.utr,
      narration: `NEFT CR - ${merchant.gateway.toUpperCase()} / ${merchant.name.toUpperCase()} / ${batch.id}`,
      credit_paise: credit,
      running_balance_paise: null,
    });
  }

  for (const row of bank_statement) {
    if (mismatchedBatchUtrs.has(row.utr)) row.credit_paise -= 50000;
  }

  bank_statement.push({
    date: '2026-09-04',
    utr: 'HDFCDEMO9999',
    narration: `NEFT CR - ${vendorNames[0].toUpperCase()} / UNMATCHED CREDIT`,
    credit_paise: 245000,
    running_balance_paise: null,
  });
  ground_truth.push({
    record_id: 'HDFCDEMO9999',
    expected_status: 'QUARANTINED',
    break_type: 'ORPHAN_BANK_CREDIT',
    expected_root_cause: 'ORPHAN_BANK_STATEMENT_CREDIT',
    notes: 'Bank credit has no matching Razorpay settlement UTR.',
  });

  return { internal_orders, razorpay_recon, bank_statement, settlement_batches, ground_truth, seed };
}

function customerName(index: number): string {
  return customerNames[index % customerNames.length];
}

function describeScenario(breakType: BreakType): string {
  const descriptions: Record<BreakType, string> = {
    CLEAN_MATCH: 'Exact order, fee, tax, and settlement batch match.',
    REFUND_NETTED_WRONG_BATCH: 'Refund is posted into a later settlement batch.',
    MDR_FEE_SPIKE: 'American Express payment uses a higher commercial MDR rate.',
    GST_ROUNDING_VARIANCE: 'GST differs from the expected fee calculation by 25 paise.',
    WEEKEND_T2_DRIFT: 'Settlement is delayed by one additional day over a weekend.',
    PARTIAL_RESERVE_HOLD: 'Ten percent of the payment is held in a Razorpay reserve.',
    ORPHAN_BANK_CREDIT: 'Bank credit has no corresponding Razorpay settlement.',
    DUPLICATE_REFERENCE: 'Internal ledger contains the same order reference twice.',
    FORMAT_DRIFT: 'One source uses a hyphenated order reference.',
    MISSING_RAZORPAY_PAYMENT: 'Internal order has no Razorpay payment row.',
    AMOUNT_MISMATCH: 'Razorpay amount differs from the internal order by one rupee.',
    CHARGEBACK_CLAWBACK: 'A chargeback adjustment claws back part of the settled payment.',
    BATCH_TOTAL_MISMATCH: 'Bank settlement credit is short by ₹500.00 against the Razorpay batch total.',
  };
  return descriptions[breakType];
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function toRazorpayReconResponse(items: RazorpayReconItem[]): RazorpayReconResponse {
  return {
    entity: 'collection',
    count: items.length,
    items,
  };
}
