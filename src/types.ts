export type ReconType = 'payment' | 'refund' | 'transfer' | 'adjustment';
export type PaymentMethod = 'card' | 'netbanking' | 'wallet' | 'upi' | 'emi';
export type BreakType =
  | 'CLEAN_MATCH'
  | 'REFUND_NETTED_WRONG_BATCH'
  | 'MDR_FEE_SPIKE'
  | 'GST_ROUNDING_VARIANCE'
  | 'WEEKEND_T2_DRIFT'
  | 'PARTIAL_RESERVE_HOLD'
  | 'ORPHAN_BANK_CREDIT'
  | 'DUPLICATE_REFERENCE'
  | 'FORMAT_DRIFT'
  | 'MISSING_RAZORPAY_PAYMENT'
  | 'AMOUNT_MISMATCH'
  | 'CHARGEBACK_CLAWBACK'
  | 'BATCH_TOTAL_MISMATCH';

export interface RazorpayReconItem {
  entity_id: string;
  type: ReconType;
  debit: number;
  credit: number;
  amount: number;
  currency: string;
  fee: number;
  tax: number;
  on_hold: boolean;
  settled: boolean;
  created_at: number;
  settled_at: number;
  settlement_id: string;
  posted_at: number | null;
  credit_type: string;
  description: string;
  notes?: string;
  payment_id: string | null;
  settlement_utr: string;
  order_id: string;
  order_receipt?: string | null;
  method: PaymentMethod;
  card_network?: string;
  card_issuer?: string;
  card_type?: string;
  dispute_id?: string | null;
}

export interface RazorpayReconResponse {
  entity: 'collection';
  count: number;
  items: RazorpayReconItem[];
}

export interface InternalOrder {
  order_id: string;
  customer_ref: string;
  vendor_name?: string;
  gross_amount: number;
  status: 'created' | 'paid' | 'cancelled';
  created_at: number;
}

export interface BankStatementRow {
  date: string;
  utr: string;
  narration: string;
  credit_paise: number;
  running_balance_paise: number | null;
}

export interface SettlementBatch {
  id: string;
  entity: 'settlement';
  amount: number;
  status: 'created' | 'processed' | 'failed';
  fees: number;
  tax: number;
  utr: string;
  created_at: number;
}

export interface ReconInput {
  internal_orders: InternalOrder[];
  razorpay_recon: RazorpayReconItem[];
  bank_statement: BankStatementRow[];
  settlement_batches: SettlementBatch[];
}

export interface DemoData extends ReconInput {
  seed: number;
  ground_truth: GroundTruthEntry[];
}

export interface GroundTruthEntry {
  record_id: string;
  expected_status: 'RECONCILED' | 'AI_RESOLVED' | 'QUARANTINED';
  break_type: BreakType;
  expected_root_cause?: string;
  notes: string;
}

export interface ReconciledResult {
  id: string;
  order_id: string;
  settlement_id: string;
  utr: string;
  gross_amount_paise: number;
  fee_paise: number;
  tax_paise: number;
  bank_credit_paise: number;
  settlement_batch_order_count: number;
  settlement_batch_gateway_paise: number;
  settlement_batch_bank_paise?: number;
  reason: string;
  customer_name?: string;
  vendor_name?: string;
}

export interface Exception {
  exception_id: string;
  reason: string;
  delta_paise: number;
  order?: InternalOrder;
  razorpay?: RazorpayReconItem[];
  bank?: BankStatementRow;
}

export interface AIResolvedResult {
  exception_id: string;
  order_id?: string;
  root_cause: string;
  suggested_entry: string;
  confidence: number;
  audit_trail: string;
  delta_paise: number;
  customer_name?: string;
  vendor_name?: string;
  evidence?: ExceptionEvidence;
}

export interface QuarantinedResult {
  exception_id: string;
  order_id?: string;
  reason: string;
  reasoning: string;
  confidence: number;
  delta_paise: number;
  customer_name?: string;
  vendor_name?: string;
  evidence?: ExceptionEvidence;
}

export interface ExceptionEvidence {
  order_amount_paise?: number;
  payment_amount_paise?: number;
  payment_credit_paise?: number;
  gateway_fee_paise?: number;
  gateway_tax_paise?: number;
  adjustment_paise?: number;
  payment_id?: string;
  dispute_id?: string;
  settlement_id?: string;
  settlement_utr?: string;
  bank_credit_paise?: number;
  bank_narration?: string;
  gateway_description?: string;
  gateway_notes?: string;
  adjustment_description?: string;
  adjustment_id?: string;
  refund_paise?: number;
  refund_settlement_id?: string;
  refund_settlement_utr?: string;
  reserve_hold_paise?: number;
  order_record_count?: number;
  gateway_record_count?: number;
  amount_delta_paise?: number;
  payment_on_hold?: boolean;
  payment_settled?: boolean;
  payment_created_at?: number;
  payment_settled_at?: number;
  batch_gateway_paise?: number;
  batch_bank_paise?: number;
  batch_order_count?: number;
}

export interface ReconCategory {
  reason: string;
  count: number;
  amount_paise: number;
}

export interface ReconSummary {
  total_orders: number;
  gross_order_paise: number;
  gateway_credit_paise: number;
  bank_credit_paise: number;
  gateway_fee_paise: number;
  gateway_tax_paise: number;
  refund_debit_paise: number;
  net_settlement_paise: number;
  variance_paise: number;
  settlement_batch_count: number;
  mismatched_batch_count: number;
  exception_value_paise: number;
  exception_categories: ReconCategory[];
}

export interface ReconRun {
  reconciled: ReconciledResult[];
  ai_resolved: AIResolvedResult[];
  quarantined: QuarantinedResult[];
  ai_status: 'complete' | 'quota_exceeded';
  total_orders: number;
  seed: number;
  summary: ReconSummary;
}
