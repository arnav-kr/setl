import type { BankStatementRow, InternalOrder, RazorpayReconItem } from './types';

export function serializeInternalOrders(rows: InternalOrder[]): string {
  return serialize(rows, ['order_id', 'customer_ref', 'vendor_name', 'gross_amount', 'status', 'created_at']);
}

export function serializeRazorpayRecon(rows: RazorpayReconItem[]): string {
  return serialize(rows, [
    'entity_id', 'type', 'debit', 'credit', 'amount', 'currency', 'fee', 'tax',
    'on_hold', 'settled', 'created_at', 'settled_at', 'settlement_id', 'posted_at',
    'credit_type', 'description', 'notes', 'payment_id', 'settlement_utr', 'order_id',
    'order_receipt', 'method', 'card_network', 'card_issuer', 'card_type', 'dispute_id',
  ]);
}

export function serializeBankStatement(rows: BankStatementRow[]): string {
  return serialize(rows, ['date', 'utr', 'narration', 'credit_paise', 'running_balance_paise']);
}

export function parseCSV(csv: string): Record<string, string>[] {
  const [headerLine, ...lines] = csv.split(/\r?\n/).filter((line) => line.trim());
  if (!headerLine) return [];
  const headers = parseLine(headerLine);
  return lines.map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
}

export function parseInternalOrders(csv: string): InternalOrder[] {
  return parseCSV(csv).map((row) => ({
    order_id: row.order_id,
    customer_ref: row.customer_ref,
    vendor_name: row.vendor_name || undefined,
    gross_amount: integer(row.gross_amount),
    status: asStatus(row.status),
    created_at: integer(row.created_at),
  }));
}

export function parseRazorpayRecon(csv: string): RazorpayReconItem[] {
  return parseCSV(csv).map((row) => ({
    entity_id: row.entity_id,
    type: row.type as RazorpayReconItem['type'],
    debit: integer(row.debit),
    credit: integer(row.credit),
    amount: integer(row.amount),
    currency: row.currency,
    fee: integer(row.fee),
    tax: integer(row.tax),
    on_hold: row.on_hold === 'true',
    settled: row.settled === 'true',
    created_at: integer(row.created_at),
    settled_at: integer(row.settled_at),
    settlement_id: row.settlement_id,
    posted_at: nullableInteger(row.posted_at),
    credit_type: row.credit_type,
    description: row.description,
    notes: row.notes || undefined,
    payment_id: row.payment_id || null,
    settlement_utr: row.settlement_utr,
    order_id: row.order_id,
    order_receipt: row.order_receipt || null,
    method: row.method as RazorpayReconItem['method'],
    card_network: row.card_network || undefined,
    card_issuer: row.card_issuer || undefined,
    card_type: row.card_type || undefined,
    dispute_id: row.dispute_id || null,
  }));
}

export function parseBankStatement(csv: string): BankStatementRow[] {
  return parseCSV(csv).map((row) => ({
    date: row.date,
    utr: row.utr,
    narration: row.narration,
    credit_paise: integer(row.credit_paise),
    running_balance_paise: nullableInteger(row.running_balance_paise),
  }));
}

function serialize<T>(rows: T[], columns: string[]): string {
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escapeCSV((row as Record<string, unknown>)[column])).join(','))].join('\n');
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      values.push(value);
      value = '';
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function integer(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Expected an integer paise value, received "${value}"`);
  return parsed;
}

function nullableInteger(value: string): number | null {
  return value ? integer(value) : null;
}

function asStatus(value: string): InternalOrder['status'] {
  if (value === 'created' || value === 'cancelled') return value;
  return 'paid';
}
