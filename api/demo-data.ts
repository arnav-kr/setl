import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateDemoData } from '../demo/generator.js';

export default function handler(request: VercelRequest, response: VercelResponse) {
  const rawSeed = request.query.seed;
  const seed = typeof rawSeed === 'string' && Number.isInteger(Number(rawSeed)) ? Number(rawSeed) : 42;
  response.status(200).json(generateDemoData(seed));
}
