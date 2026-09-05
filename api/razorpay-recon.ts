import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateDemoData, toRazorpayReconResponse } from '../demo/generator.js';

export default function handler(request: VercelRequest, response: VercelResponse) {
  const mode = request.query.mode ?? 'demo';
  if (mode !== 'demo') {
    response.status(501).json({
      error: 'Live Razorpay ingestion is not enabled.',
      nextStep: 'Add server-side Razorpay test credentials before enabling live mode.',
    });
    return;
  }

  const rawSeed = request.query.seed;
  const seed = typeof rawSeed === 'string' && Number.isInteger(Number(rawSeed)) ? Number(rawSeed) : 42;
  response.status(200).json(toRazorpayReconResponse(generateDemoData(seed).razorpay_recon));
}
