import type { AIResolvedResult, Exception, ExceptionEvidence, QuarantinedResult, ReconCategory, ReconInput, ReconSummary, ReconciledResult } from './types';
import { formatPaise } from './currency';

const standardFee = (amount: number) => Math.round(amount * 0.02);
const standardTax = (fee: number) => Math.round(fee * 0.18);

export function runDeterministicPhase(input: ReconInput): { reconciled: ReconciledResult[]; unmatched: Exception[] } {
  const reconciled: ReconciledResult[] = [];
  const unmatched: Exception[] = [];
  const ordersById = groupBy(input.internal_orders, (row) => normalizeReference(row.order_id));
  const reconByOrder = groupBy(input.razorpay_recon, (row) => normalizeReference(row.order_id));
  const reconByUtr = groupBy(input.razorpay_recon, (row) => normalizeReference(row.settlement_utr));
  const bankByUtr = new Map(input.bank_statement.map((row) => [normalizeReference(row.utr), row]));
  const batchTotals = new Map<string, number>();

  for (const item of input.razorpay_recon) {
    batchTotals.set(item.settlement_utr, (batchTotals.get(item.settlement_utr) ?? 0) + item.credit - item.debit);
  }

  for (const [orderId, orderRows] of ordersById) {
    const order = orderRows[0];
    const items = reconByOrder.get(orderId) ?? [];
    const payment = items.find((item) => item.type === 'payment');
    const refunds = items.filter((item) => item.type === 'refund');
    const adjustments = items.filter((item) => item.type === 'adjustment');

    if (orderRows.length > 1) {
      unmatched.push({ exception_id: `EXC_DUP_${orderId}`, reason: 'DUPLICATE_REFERENCE', delta_paise: order.gross_amount, order, razorpay: items });
    } else if (!payment) {
      unmatched.push({ exception_id: `EXC_MISSING_${orderId}`, reason: 'MISSING_PAYMENT', delta_paise: order.gross_amount, order, razorpay: items });
    } else if (payment.amount !== order.gross_amount) {
      unmatched.push({ exception_id: `EXC_AMOUNT_${orderId}`, reason: 'AMOUNT_MISMATCH', delta_paise: Math.abs(payment.amount - order.gross_amount), order, razorpay: items });
    } else if (payment.on_hold || payment.credit < payment.amount - payment.fee - payment.tax) {
      unmatched.push({ exception_id: `EXC_RESERVE_${orderId}`, reason: 'PARTIAL_RESERVE_HOLD', delta_paise: payment.amount - payment.fee - payment.tax - payment.credit, order, razorpay: items });
    } else if (adjustments.length > 0) {
      unmatched.push({ exception_id: `EXC_CHARGEBACK_${orderId}`, reason: 'CHARGEBACK_CLAWBACK', delta_paise: adjustments.reduce((sum, item) => sum + item.debit, 0), order, razorpay: items });
    } else if (payment.fee > standardFee(payment.amount) * 1.25) {
      unmatched.push({ exception_id: `EXC_MDR_${orderId}`, reason: 'MDR_FEE_VARIANCE', delta_paise: payment.fee - standardFee(payment.amount), order, razorpay: items });
    } else if (payment.tax !== standardTax(payment.fee)) {
      unmatched.push({ exception_id: `EXC_GST_${orderId}`, reason: 'GST_ROUNDING_VARIANCE', delta_paise: payment.tax - standardTax(payment.fee), order, razorpay: items });
    } else if (refunds.length > 0) {
      unmatched.push({ exception_id: `EXC_REFUND_${orderId}`, reason: 'REFUND_NETTED_WRONG_BATCH', delta_paise: refunds.reduce((sum, item) => sum + item.debit, 0), order, razorpay: items });
    } else {
      const bank = bankByUtr.get(normalizeReference(payment.settlement_utr));
      if (!bank) {
        unmatched.push({ exception_id: `EXC_BATCH_${orderId}`, reason: 'MISSING_BANK_CREDIT', delta_paise: payment.credit, order, razorpay: items });
      } else {
        reconciled.push({
          id: `REC_${orderId}`,
          order_id: orderId,
          settlement_id: payment.settlement_id,
          utr: payment.settlement_utr,
          gross_amount_paise: payment.amount,
          fee_paise: payment.fee,
          tax_paise: payment.tax,
          bank_credit_paise: payment.credit,
          settlement_batch_order_count: (reconByUtr.get(normalizeReference(payment.settlement_utr)) ?? []).filter((item) => item.type === 'payment').length,
          settlement_batch_gateway_paise: batchTotals.get(payment.settlement_utr) ?? payment.credit,
          settlement_batch_bank_paise: bankByUtr.get(normalizeReference(payment.settlement_utr))?.credit_paise,
          reason: 'Exact order, fee, tax, and settlement batch tie-out',
          customer_name: order.customer_ref,
          vendor_name: order.vendor_name,
        });
      }
    }
  }

  for (const [utr, batchTotal] of batchTotals) {
    const bank = bankByUtr.get(normalizeReference(utr));
    if (bank && bank.credit_paise !== batchTotal) {
      unmatched.push({
        exception_id: `EXC_BATCH_${utr}`,
        reason: 'BATCH_TOTAL_MISMATCH',
        delta_paise: Math.abs(bank.credit_paise - batchTotal),
        bank,
        razorpay: input.razorpay_recon.filter((item) => normalizeReference(item.settlement_utr) === normalizeReference(utr)),
      });
    }
  }

  for (const row of input.bank_statement) {
    if (!input.razorpay_recon.some((item) => normalizeReference(item.settlement_utr) === normalizeReference(row.utr))) {
      unmatched.push({ exception_id: `EXC_ORPHAN_${row.utr}`, reason: 'ORPHAN_BANK_CREDIT', delta_paise: row.credit_paise, bank: row });
    }
  }

  return { reconciled, unmatched };
}

export function runExceptionPhase(unmatched: Exception[]): { ai_resolved: AIResolvedResult[]; quarantined: QuarantinedResult[] } {
  const ai_resolved: AIResolvedResult[] = [];
  const quarantined: QuarantinedResult[] = [];
  const resolvable = ['MDR_FEE_VARIANCE', 'GST_ROUNDING_VARIANCE', 'REFUND_NETTED_WRONG_BATCH'];

  for (const exception of unmatched) {
    const amount = formatPaise(exception.delta_paise);
    if (resolvable.includes(exception.reason)) {
      ai_resolved.push({
        exception_id: exception.exception_id,
        order_id: exception.order?.order_id,
        root_cause: exception.reason,
        suggested_entry: `Debit Settlement Variance A/C ${amount}, Credit Razorpay Clearing ${amount}`,
        confidence: 0.94,
        audit_trail: `${exception.reason} was identified from deterministic paise arithmetic. The computed delta is ${amount}; no unsupported transaction facts were introduced.`,
        delta_paise: exception.delta_paise,
        customer_name: exception.order?.customer_ref,
        vendor_name: exception.order?.vendor_name,
        evidence: buildExceptionEvidence(exception),
      });
    } else {
      quarantined.push({
        exception_id: exception.exception_id,
        order_id: exception.order?.order_id,
        reason: exception.reason,
        reasoning: `The available records do not support a confident resolution. Human finance review is required for the ${amount} variance.`,
        confidence: 0.35,
        delta_paise: exception.delta_paise,
        customer_name: exception.order?.customer_ref,
        vendor_name: exception.order?.vendor_name,
        evidence: buildExceptionEvidence(exception),
      });
    }
  }
  return { ai_resolved, quarantined };
}

export async function runExceptionPhaseAsync(unmatched: Exception[]): Promise<{ ai_resolved: AIResolvedResult[]; quarantined: QuarantinedResult[]; ai_status: 'complete' | 'quota_exceeded' }> {
  const deterministic = runExceptionPhase(unmatched);
  const resolvable = new Set(['MDR_FEE_VARIANCE', 'GST_ROUNDING_VARIANCE', 'REFUND_NETTED_WRONG_BATCH']);
  const uniqueExceptions = [...new Map(unmatched.map((exception) => [exception.exception_id, exception])).values()];
  const aiCandidates = uniqueExceptions
    .filter((exception) => !resolvable.has(exception.reason))
    .sort((left, right) => Math.abs(right.delta_paise) - Math.abs(left.delta_paise))
    .slice(0, 5);
  const aiCandidateIds = new Set(aiCandidates.map((exception) => exception.exception_id));
  const quarantined: QuarantinedResult[] = [
    ...uniqueExceptions
      .filter((exception) => !resolvable.has(exception.reason) && !aiCandidateIds.has(exception.exception_id))
      .map((exception) => ({
        exception_id: exception.exception_id,
        order_id: exception.order?.order_id,
        reason: exception.reason,
        reasoning: 'Queued for human review without AI analysis to keep processing costs controlled.',
        confidence: 0,
        delta_paise: exception.delta_paise,
        customer_name: exception.order?.customer_ref,
        vendor_name: exception.order?.vendor_name,
        evidence: buildExceptionEvidence(exception),
      })),
  ];
  const ai_resolved = [...deterministic.ai_resolved];
  let ai_status: 'complete' | 'quota_exceeded' = 'complete';

  for (const [candidateIndex, exception] of aiCandidates.entries()) {
    try {
      const res = await fetch('/api/gemini-resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exception: compactExceptionEvidence(exception) }),
      });

      if (res.ok) {
        const data: unknown = await res.json();
        if (isGeminiResolution(data) && data.status === 'AI_RESOLVED' && data.confidence >= 0.85) {
          ai_resolved.push({
            exception_id: data.exception_id,
            order_id: exception.order?.order_id,
            root_cause: data.root_cause,
            suggested_entry: data.suggested_entry,
            confidence: data.confidence,
            audit_trail: data.audit_trail,
            delta_paise: exception.delta_paise,
            evidence: buildExceptionEvidence(exception),
          });
          continue;
        } else if (isGeminiResolution(data) && data.status === 'QUARANTINED') {
          quarantined.push({
            exception_id: data.exception_id,
            order_id: exception.order?.order_id,
            reason: exception.reason,
            reasoning: data.audit_trail,
            confidence: data.confidence,
            delta_paise: exception.delta_paise,
            customer_name: exception.order?.customer_ref,
            vendor_name: exception.order?.vendor_name,
            evidence: buildExceptionEvidence(exception),
          });
          continue;
        }
      } else {
        const data = await res.json().catch(() => null) as { code?: string; error?: string } | null;
        if (res.status === 429 || data?.code === 'AI_QUOTA_EXCEEDED') {
          ai_status = 'quota_exceeded';
          const remainingCandidates = aiCandidates.slice(candidateIndex);
          quarantined.push(...remainingCandidates.map((remainingException) => ({
            exception_id: remainingException.exception_id,
            order_id: remainingException.order?.order_id,
            reason: remainingException.reason,
            reasoning: 'AI analysis stopped because the Gemini token quota was reached. Review this exception manually or retry after the quota resets.',
            confidence: 0,
            delta_paise: remainingException.delta_paise,
            customer_name: remainingException.order?.customer_ref,
            vendor_name: remainingException.order?.vendor_name,
            evidence: buildExceptionEvidence(remainingException),
          })));
          break;
        }
      }
    } catch (error) {
      quarantined.push({
        exception_id: exception.exception_id,
        order_id: exception.order?.order_id,
        reason: exception.reason,
        reasoning: error instanceof Error ? `Gemini resolution failed: ${error.message}` : 'Gemini resolution failed. Human finance review is required.',
        confidence: 0,
        delta_paise: exception.delta_paise,
        customer_name: exception.order?.customer_ref,
        vendor_name: exception.order?.vendor_name,
        evidence: buildExceptionEvidence(exception),
      });
      continue;
    }

    function compactExceptionEvidence(exception: Exception): Record<string, unknown> {
      return {
        exception_id: exception.exception_id,
        reason: exception.reason,
        delta_paise: exception.delta_paise,
        order: exception.order ? {
          order_id: exception.order.order_id,
          customer_ref: exception.order.customer_ref,
          vendor_name: exception.order.vendor_name,
          gross_amount: exception.order.gross_amount,
          status: exception.order.status,
        } : undefined,
        gateway: exception.razorpay?.map((item) => ({
          type: item.type,
          amount: item.amount,
          debit: item.debit,
          credit: item.credit,
          fee: item.fee,
          tax: item.tax,
          on_hold: item.on_hold,
          settlement_id: item.settlement_id,
          settlement_utr: item.settlement_utr,
        })),
        bank: exception.bank ? {
          utr: exception.bank.utr,
          credit_paise: exception.bank.credit_paise,
          date: exception.bank.date,
          narration: exception.bank.narration,
        } : undefined,
      };
    }

    quarantined.push({
      exception_id: exception.exception_id,
      order_id: exception.order?.order_id,
      reason: exception.reason,
      reasoning: 'Gemini did not return a valid resolution. Human finance review is required.',
      confidence: 0,
      delta_paise: exception.delta_paise,
      customer_name: exception.order?.customer_ref,
      vendor_name: exception.order?.vendor_name,
    });
  }

  return { ai_resolved, quarantined, ai_status };
}

function buildExceptionEvidence(exception: Exception): ExceptionEvidence {
  const payment = exception.razorpay?.find((item) => item.type === 'payment');
  const adjustment = exception.razorpay?.find((item) => item.type === 'adjustment');
  const refund = exception.razorpay?.find((item) => item.type === 'refund');
  const batchGatewayPaise = exception.razorpay?.reduce((sum, item) => sum + item.credit - item.debit, 0);
  const batchBankPaise = exception.bank?.credit_paise;
  return {
    order_amount_paise: exception.order?.gross_amount,
    payment_amount_paise: payment?.amount,
    payment_credit_paise: payment?.credit,
    gateway_fee_paise: payment?.fee,
    gateway_tax_paise: payment?.tax,
    adjustment_paise: adjustment?.debit,
    payment_id: payment?.payment_id ?? undefined,
    dispute_id: adjustment?.dispute_id ?? undefined,
    settlement_id: payment?.settlement_id ?? adjustment?.settlement_id,
    settlement_utr: payment?.settlement_utr ?? adjustment?.settlement_utr ?? exception.razorpay?.[0]?.settlement_utr ?? exception.bank?.utr,
    bank_credit_paise: exception.bank?.credit_paise,
    bank_narration: exception.bank?.narration,
    gateway_description: adjustment?.description ?? payment?.description,
    gateway_notes: adjustment?.notes ?? payment?.notes,
    adjustment_description: adjustment?.description,
    adjustment_id: adjustment?.entity_id,
    refund_paise: exception.razorpay?.filter((item) => item.type === 'refund').reduce((sum, item) => sum + item.debit, 0) || undefined,
    refund_settlement_id: refund?.settlement_id,
    refund_settlement_utr: refund?.settlement_utr,
    reserve_hold_paise: payment && payment.amount - payment.fee - payment.tax - payment.credit > 0 ? payment.amount - payment.fee - payment.tax - payment.credit : undefined,
    order_record_count: exception.order ? 1 : undefined,
    gateway_record_count: exception.razorpay?.length,
    amount_delta_paise: exception.order && payment ? payment.amount - exception.order.gross_amount : undefined,
    payment_on_hold: payment?.on_hold,
    payment_settled: payment?.settled,
    payment_created_at: payment?.created_at,
    payment_settled_at: payment?.settled_at,
    batch_gateway_paise: batchGatewayPaise,
    batch_bank_paise: batchBankPaise,
    batch_order_count: exception.razorpay?.filter((item) => item.type === 'payment').length,
  };
}

export function createReconSummary(input: ReconInput, aiResolved: AIResolvedResult[], quarantined: QuarantinedResult[]): ReconSummary {
  const gateway = input.razorpay_recon;
  const grossOrderPaise = input.internal_orders.reduce((sum, row) => sum + row.gross_amount, 0);
  const gatewayCreditPaise = gateway.reduce((sum, row) => sum + row.credit, 0);
  const bankCreditPaise = input.bank_statement.reduce((sum, row) => sum + row.credit_paise, 0);
  const gatewayFeePaise = gateway.reduce((sum, row) => sum + row.fee, 0);
  const gatewayTaxPaise = gateway.reduce((sum, row) => sum + row.tax, 0);
  const refundDebitPaise = gateway.filter((row) => row.type === 'refund').reduce((sum, row) => sum + row.debit, 0);
  const exceptionItems = [
    ...aiResolved.map((item) => ({ reason: item.root_cause, amount_paise: Math.abs(item.delta_paise) })),
    ...quarantined.map((item) => ({ reason: item.reason, amount_paise: Math.abs(item.delta_paise) })),
  ];
  const categoryMap = new Map<string, ReconCategory>();
  for (const item of exceptionItems) {
    const category = categoryMap.get(item.reason) ?? { reason: item.reason, count: 0, amount_paise: 0 };
    category.count += 1;
    category.amount_paise += item.amount_paise;
    categoryMap.set(item.reason, category);
  }
  const batchTotals = new Map<string, number>();
  for (const row of gateway) batchTotals.set(row.settlement_utr, (batchTotals.get(row.settlement_utr) ?? 0) + row.credit - row.debit);
  const bankByUtr = new Map(input.bank_statement.map((row) => [normalizeReference(row.utr), row.credit_paise]));
  const mismatchedBatchCount = [...batchTotals].filter(([utr, total]) => bankByUtr.get(normalizeReference(utr)) !== undefined && bankByUtr.get(normalizeReference(utr)) !== total).length;
  return {
    total_orders: input.internal_orders.length,
    gross_order_paise: grossOrderPaise,
    gateway_credit_paise: gatewayCreditPaise,
    bank_credit_paise: bankCreditPaise,
    gateway_fee_paise: gatewayFeePaise,
    gateway_tax_paise: gatewayTaxPaise,
    refund_debit_paise: refundDebitPaise,
    net_settlement_paise: gatewayCreditPaise - gatewayFeePaise - gatewayTaxPaise - refundDebitPaise,
    variance_paise: bankCreditPaise - (gatewayCreditPaise - gatewayFeePaise - gatewayTaxPaise - refundDebitPaise),
    settlement_batch_count: batchTotals.size,
    mismatched_batch_count: mismatchedBatchCount,
    exception_value_paise: exceptionItems.reduce((sum, item) => sum + item.amount_paise, 0),
    exception_categories: [...categoryMap.values()].sort((a, b) => b.amount_paise - a.amount_paise),
  };
}

function isGeminiResolution(value: unknown): value is {
  exception_id: string;
  root_cause: string;
  suggested_entry: string;
  confidence: number;
  audit_trail: string;
  status: 'AI_RESOLVED' | 'QUARANTINED';
} {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return typeof result.exception_id === 'string'
    && typeof result.root_cause === 'string'
    && typeof result.suggested_entry === 'string'
    && typeof result.confidence === 'number'
    && result.confidence >= 0 && result.confidence <= 1
    && typeof result.audit_trail === 'string'
    && (result.status === 'AI_RESOLVED' || result.status === 'QUARANTINED');
}


function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(key(row)) ?? [];
    group.push(row);
    groups.set(key(row), group);
  }
  return groups;
}

function normalizeReference(reference: string): string {
  return reference.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}
