/**
 * Optional LLM step for AI Topic Insights. Only called when OPENAI_API_KEY is set.
 * Sends redacted excerpts and the computed issue list; never sends note IDs or
 * anything else about clients.
 */

export interface LlmInput {
  topicLabel: string;
  span: string;
  analyzedNotes: number;
  issues: { title: string; shareLabel: string }[];
  excerpts: string[];
}

export interface LlmOutput {
  summary: string;
  hypotheses: string[];
  model: string;
}

export class LlmError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export function llmEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

const SYSTEM = [
  'You summarize redacted customer support notes for an internal analytics tool.',
  'Reply with JSON: {"summary": string, "hypotheses": [string, string]}.',
  'summary: 1-2 plain sentences describing what clients are concerned about, based only on the notes and issues given.',
  'hypotheses: exactly 2 ideas worth investigating, each phrased as a possibility ("might", "could be worth testing"), never as a proven fix.',
  'Do not invent numbers, names or facts that are not in the input.'
].join(' ');

export async function llmSummarize(input: LlmInput): Promise<LlmOutput> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new LlmError('AI-NOKEY', 'OPENAI_API_KEY is not set.');
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const user = {
    topic: input.topicLabel,
    dates: input.span,
    notesAnalyzed: input.analyzedNotes,
    recurringIssues: input.issues,
    sampleExcerpts: input.excerpts.slice(0, 60).map((e) => e.slice(0, 240))
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.OPENAI_TIMEOUT_MS ?? 20000));
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify(user) }
        ]
      })
    });
  } catch (e) {
    throw new LlmError(ctrl.signal.aborted ? 'AI-TIMEOUT' : 'AI-NETWORK', ctrl.signal.aborted ? 'The analysis service timed out.' : 'Could not reach the analysis service.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new LlmError(`AI-HTTP-${res.status}`, `The analysis service returned an error (HTTP ${res.status}).`);

  let parsed: { summary?: unknown; hypotheses?: unknown };
  try {
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    parsed = JSON.parse(body.choices?.[0]?.message?.content ?? '{}');
  } catch {
    throw new LlmError('AI-PARSE', 'The analysis service returned an unreadable response.');
  }
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const hypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses.filter((h): h is string => typeof h === 'string' && !!h.trim()).slice(0, 3) : [];
  if (!summary || hypotheses.length === 0) throw new LlmError('AI-PARSE', 'The analysis service returned an incomplete response.');
  return { summary, hypotheses, model };
}
