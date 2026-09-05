import type { VercelRequest, VercelResponse } from '@vercel/node';

const model = 'gemini-3.6-flash';

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Only POST is supported.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    response.status(503).json({ error: 'GEMINI_API_KEY is not configured.' });
    return;
  }

  const { exception } = request.body as { exception?: unknown };
  if (!exception || typeof exception !== 'object') {
    response.status(400).json({ error: 'Request body must contain an exception object.' });
    return;
  }

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildPrompt(exception) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 1024,
        responseSchema: {
          type: 'OBJECT',
          properties: {
            exception_id: { type: 'STRING' },
            root_cause: { type: 'STRING' },
            suggested_entry: { type: 'STRING' },
            confidence: { type: 'NUMBER' },
            audit_trail: { type: 'STRING' },
            status: { type: 'STRING', enum: ['AI_RESOLVED', 'QUARANTINED'] },
          },
          required: ['exception_id', 'root_cause', 'suggested_entry', 'confidence', 'audit_trail', 'status'],
        },
      },
    }),
  });

  const payload = await upstream.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    error?: { message?: string; status?: string; details?: Array<{ reason?: string }> };
  };
  if (!upstream.ok) {
    const errorText = `${payload.error?.status ?? ''} ${payload.error?.message ?? ''} ${JSON.stringify(payload.error?.details ?? '')}`.toLowerCase();
    const isQuotaError = upstream.status === 429
      || errorText.includes('quota')
      || errorText.includes('resource_exhausted')
      || errorText.includes('rate limit')
      || errorText.includes('tokens per minute');
    if (isQuotaError) {
      response.status(429).json({
        code: 'AI_QUOTA_EXCEEDED',
        error: 'Gemini token quota or rate limit was reached. Remaining exceptions were held for human review.',
      });
      return;
    }
    response.status(502).json({ error: payload.error?.message ?? 'Gemini request failed.' });
    return;
  }

  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    response.status(502).json({ error: 'Gemini returned no structured resolution.' });
    return;
  }

  if (candidate?.finishReason === 'MAX_TOKENS') {
    response.status(502).json({ error: 'Gemini response was truncated due to output token limits.' });
    return;
  }

  try {
    const cleanedText = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const result = JSON.parse(cleanedText) as Record<string, unknown>;
    if (
      result.exception_id !== undefined && typeof result.exception_id !== 'string' ||
      typeof result.root_cause !== 'string' ||
      typeof result.suggested_entry !== 'string' ||
      typeof result.audit_trail !== 'string' ||
      typeof result.confidence !== 'number' ||
      result.confidence < 0 || result.confidence > 1 ||
      !['AI_RESOLVED', 'QUARANTINED'].includes(String(result.status))
    ) {
      response.status(502).json({ error: 'Gemini returned an invalid resolution payload.' });
      return;
    }
    response.status(200).json(result);
  } catch {
    response.status(502).json({ error: 'Gemini returned malformed JSON.' });
  }
}

function buildPrompt(exception: unknown): string {
  return [
    'Analyze this reconciliation exception using only the supplied evidence.',
    'Do not recalculate or invent facts. Use AI_RESOLVED only if evidence supports confidence >= 0.85; otherwise use QUARANTINED.',
    'Keep suggested_entry and audit_trail concise.',
    JSON.stringify(exception),
  ].join('\n\n');
}
