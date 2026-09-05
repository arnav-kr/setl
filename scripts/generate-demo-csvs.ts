import { mkdir, writeFile } from 'node:fs/promises';
import { generateDemoData } from '../demo/generator.js';
import { serializeBankStatement, serializeInternalOrders, serializeRazorpayRecon } from '../src/csv.js';

const demo = generateDemoData(42);
await mkdir('public/demo-data', { recursive: true });
await Promise.all([
  writeFile('public/demo-data/merchant-ledger.csv', serializeInternalOrders(demo.internal_orders), 'utf8'),
  writeFile('public/demo-data/gateway-settlements.csv', serializeRazorpayRecon(demo.razorpay_recon), 'utf8'),
  writeFile('public/demo-data/bank-statement.csv', serializeBankStatement(demo.bank_statement), 'utf8'),
]);
