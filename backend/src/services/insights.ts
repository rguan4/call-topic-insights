import type {
  InsightIssue, InsightResult, InsightScope, InsightScopeInput, InsightStatus, User
} from '@cti/shared';
import { canRead } from '../auth';
import { RANGES, span } from '../data/dates';
import { PARENT, SUB, TEAMS, subName, templatesOf, type ParentDef, type SubDef } from '../data/catalog';
import { notesOf, type Note } from '../data/notes';
import { save, state } from '../data/state';
import { HttpError } from '../errors';
import { parseFilters } from '../filters';
import { LlmError, llmEnabled, llmSummarize } from './llm';

/**
 * Owner: AI insights service.
 *
 * A job samples the notes in scope, groups them into recurring issues with exact
 * shares, keeps every supporting note ID, and writes a summary + hypotheses
 * (OpenAI when OPENAI_API_KEY is set, deterministic rule-based text otherwise).
 */

const MIN_NOTES = 40;
const SAMPLE_SIZE = 400;
const MAX_STORED = 60;

interface StoredIssue extends InsightIssue {
  ids: string[];
}
interface StoredInsight extends Omit<InsightResult, 'issues' | 'feedback'> {
  ownerId: string;
  issues?: StoredIssue[];
  helpful: boolean | null;
  reports: { ref: string; reason: string; details: string; by: string; at: string }[];
}
interface InsightsSlice {
  jobs?: Record<string, StoredInsight>;
  seq?: number;
}

const slice = () => state.insights as InsightsSlice;
const jobs = () => (slice().jobs ??= {});
/** Jobs whose generation is running in this process (others marked running were interrupted). */
const active = new Set<string>();

const num = (n: number) => n.toLocaleString('en-US');
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function nextId(prefix: string): string {
  const s = slice();
  s.seq = (s.seq ?? 0) + 1;
  return `${prefix}${1000 + s.seq}`;
}

function stepDelay(): number {
  if (process.env.CTI_AI_DELAY_MS) return Number(process.env.CTI_AI_DELAY_MS);
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return 5;
  return 700;
}

const seqOf = (id: string) => Number(id.replace(/\D/g, '')) || 0;

function nowPT(): string {
  return `${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} PT`;
}

function resolveScope(input: InsightScopeInput, user: User): { parent: ParentDef; sub: SubDef | null; scope: InsightScope; pool: Note[] } {
  const parent = PARENT[input.topicId];
  if (!parent) throw new HttpError(404, 'topic_not_found', `Topic "${input.topicId}" doesn't exist.`);
  const sub = input.subId === 'all' ? null : SUB[input.subId];
  if (input.subId !== 'all' && (!sub || sub.parentId !== parent.id)) {
    throw new HttpError(404, 'subtopic_not_found', `Subtopic "${input.subId}" isn't part of ${parent.name}.`);
  }
  const f = parseFilters({ range: input.range || undefined, version: input.version || undefined, team: input.team || undefined }, user);
  if (!canRead(user, parent.team)) throw new HttpError(403, 'forbidden_team', "You don't have access to this topic.");

  const days = RANGES[f.range].days;
  const subs = sub ? [sub] : parent.subs;
  let pool: Note[] = [];
  for (const s of subs) pool = pool.concat(notesOf(s).filter((n) => n.off < days));
  if (subs.length > 1) pool.sort((a, b) => a.off - b.off || a.subId.localeCompare(b.subId) || a.i - b.i);

  const total = pool.length;
  const sampled = total > SAMPLE_SIZE;
  const analyzed = sampled ? SAMPLE_SIZE : total;
  const sName = sub ? subName(sub, f.version) : null;
  const scope: InsightScope = {
    topicId: parent.id,
    subId: sub ? sub.id : 'all',
    range: f.range,
    version: f.version,
    team: f.team,
    topicName: parent.name,
    subName: sName,
    topicLabel: sub ? `${parent.name} › ${sName}` : `${parent.name} (all subtopics)`,
    span: span(days - 1, 0),
    rangeLabel: RANGES[f.range].label,
    teamLabel: f.team === 'all' ? 'All teams' : TEAMS[f.team],
    ownerTeamLabel: TEAMS[parent.team],
    totalNotes: total,
    analyzedNotes: analyzed,
    sampled,
    notesLabel: sampled ? `${num(analyzed)} sampled of ${num(total)} support notes` : `All ${num(total)} support notes`
  };
  return { parent, sub, scope, pool };
}

/** Evenly spaced sample across the date-ordered pool (stratified by date). */
function sampleOf(pool: Note[], k: number): Note[] {
  const out: Note[] = [];
  for (let j = 0; j < k; j++) out.push(pool[Math.floor((j * pool.length) / k)]);
  return out;
}

function buildIssues(parent: ParentDef, sub: SubDef | null, version: string, sample: Note[], sampled: boolean): StoredIssue[] {
  const k = sample.length;
  const groups: { title: string; match: (n: Note) => boolean }[] = sub
    ? templatesOf(sub).map((t, ti) => ({ title: t[1], match: (n: Note) => n.tags.includes(ti) }))
    : parent.subs.map((s) => ({ title: subName(s, version), match: (n: Note) => n.subId === s.id }));
  return groups
    .map((g) => ({ title: g.title, notes: sample.filter(g.match) }))
    .filter((g) => g.notes.length > 0)
    .sort((a, b) => b.notes.length - a.notes.length)
    .slice(0, 3)
    .map((g) => {
      const count = g.notes.length;
      const pct = Math.round((count / k) * 100);
      return {
        title: g.title,
        count,
        pct,
        shareLabel: `${pct}% of ${num(k)} ${sampled ? 'sampled notes' : 'notes'}`,
        sources: g.notes.slice(0, 3).map((n) => ({ id: n.id, date: n.date, excerpt: n.excerpt })),
        supportingCount: count,
        ids: g.notes.map((n) => n.id)
      };
    });
}

const CUSTOM: Record<string, { summary: string; hypotheses: string[] }> = {
  'wire-re': {
    summary: 'Clients buying a home want to wire money to escrow with confidence. The main concerns are how to start the wire, whether it will arrive before closing, and what the title company needs.',
    hypotheses: [
      'Showing the same-day cutoff and expected arrival time on the wire confirmation screen might reduce timing questions.',
      'A home-purchase checklist in the wire flow might reduce document questions.'
    ]
  },
  'wire-status': {
    summary: 'Clients want to know where a wire is after they send it. Most ask about pending status, proof that it went out, or returned wires.',
    hypotheses: [
      'A status timeline that shows the reference number might reduce “where is my wire” questions.',
      'Explaining name-matching rules before submission might reduce returned wires.'
    ]
  },
  'tax-1099': {
    summary: 'Clients mostly ask when the 1099 is ready and why its amounts differ from what they expected.',
    hypotheses: [
      'A release-date reminder before tax season might reduce availability questions.',
      'Clearer cost basis notes beside the form might reduce amount questions.'
    ]
  }
};

function ruleBasedText(parent: ParentDef, sub: SubDef | null, issues: StoredIssue[]): { summary: string; hypotheses: string[] } {
  if (sub && CUSTOM[sub.id]) return CUSTOM[sub.id];
  const t = issues.map((i) => lc(i.title));
  const list = `${t[0] ?? 'this topic'}${t[1] ? `, followed by ${t[1]}` : ''}${t[2] ? ` and ${t[2]}` : ''}`;
  return {
    summary: sub ? `Most sampled notes are about ${list}.` : `Across ${parent.name}, most sampled notes are about ${list}.`,
    hypotheses: [
      `Clearer in-app guidance on ${t[0] ?? 'this topic'} might reduce these contacts.`,
      `A proactive message about ${t[1] ?? t[0] ?? 'this topic'} could be worth testing.`
    ]
  };
}

function setJob(id: string, patch: Partial<StoredInsight>): void {
  const j = jobs()[id];
  if (!j) return; // State was reset while generating.
  Object.assign(j, patch);
  save();
}

function prune(): void {
  const all = Object.values(jobs()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const j of all.slice(MAX_STORED)) delete jobs()[j.id];
}

async function run(id: string, parent: ParentDef, sub: SubDef | null, pool: Note[], scope: InsightScope): Promise<void> {
  const started = Date.now();
  const wait = () => new Promise((r) => setTimeout(r, stepDelay()));
  try {
    await wait();
    if (pool.length < MIN_NOTES) {
      setJob(id, { status: 'insufficient', step: 3 });
      return;
    }
    const sample = sampleOf(pool, Math.min(SAMPLE_SIZE, pool.length));
    setJob(id, { step: 1 });
    await wait();
    const issues = buildIssues(parent, sub, scope.version, sample, scope.sampled);
    setJob(id, { step: 2 });
    await wait();
    if (process.env.CTI_AI_FAIL === '1') throw new LlmError('AI-5023', 'The analysis service timed out.');

    let text: { summary: string; hypotheses: string[] };
    let model = 'rule-based';
    if (llmEnabled()) {
      const out = await llmSummarize({
        topicLabel: scope.topicLabel,
        span: scope.span,
        analyzedNotes: sample.length,
        issues: issues.map((i) => ({ title: i.title, shareLabel: i.shareLabel })),
        excerpts: sample.map((n) => n.excerpt)
      });
      text = out;
      model = out.model;
    } else {
      text = ruleBasedText(parent, sub, issues);
    }
    const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
    setJob(id, {
      status: 'completed',
      step: 3,
      issues,
      summary: text.summary,
      hypotheses: text.hypotheses,
      model,
      generatedAt: nowPT(),
      durationLabel: `${secs} second${secs === 1 ? '' : 's'}`
    });
  } catch (e) {
    const code = e instanceof LlmError ? e.code : 'AI-INTERNAL';
    const message = e instanceof LlmError ? e.message : 'Something went wrong while generating insights.';
    setJob(id, { status: 'failed', step: 3, error: { code, message, ref: nextId('AI-') } });
  } finally {
    active.delete(id);
  }
}

function toResult(j: StoredInsight): InsightResult {
  if (j.status === 'running' && !active.has(j.id)) {
    // The server restarted while this job was running.
    j.status = 'failed';
    j.step = 3;
    j.error = { code: 'AI-INTERRUPTED', message: 'Generation was interrupted. Try again.', ref: nextId('AI-') };
    save();
  }
  const { ownerId: _owner, issues, helpful, reports, ...rest } = j;
  return {
    ...rest,
    issues: issues?.map(({ ids: _ids, ...i }) => i),
    feedback: { helpful, reportRef: reports.length ? reports[reports.length - 1].ref : null }
  };
}

function getStored(id: string, user: User): StoredInsight {
  const j = jobs()[id];
  if (!j) throw new HttpError(404, 'insight_not_found', `Insight ${id} doesn't exist.`);
  const parent = PARENT[j.scope.topicId];
  if (!parent || !canRead(user, parent.team)) throw new HttpError(403, 'forbidden_team', "You don't have access to this topic.");
  return j;
}

export function createInsight(input: InsightScopeInput, user: User): InsightResult {
  if (!input || typeof input.topicId !== 'string' || typeof input.subId !== 'string') {
    throw new HttpError(400, 'invalid_scope', 'topicId and subId are required.');
  }
  const { parent, sub, scope, pool } = resolveScope(input, user);
  const id = nextId('ins-');
  const job: StoredInsight = {
    id,
    status: 'running' as InsightStatus,
    step: 0,
    scope,
    createdAt: new Date().toISOString(),
    ownerId: user.id,
    helpful: null,
    reports: []
  };
  jobs()[id] = job;
  prune();
  save();
  active.add(id);
  void run(id, parent, sub, pool, scope);
  return toResult(job);
}

/** Scope preview for the panel before anything is generated (no job is created). */
export function previewScope(input: InsightScopeInput, user: User): InsightScope {
  return resolveScope(input, user).scope;
}

export function getInsight(id: string, user: User): InsightResult {
  return toResult(getStored(id, user));
}

/** The user's most recent insight for a topic + subtopic, in any range or version. */
export function latestInsight(topicId: string, subId: string, user: User): InsightResult {
  const parent = PARENT[topicId];
  if (!parent) throw new HttpError(404, 'topic_not_found', `Topic "${topicId}" doesn't exist.`);
  if (!canRead(user, parent.team)) throw new HttpError(403, 'forbidden_team', "You don't have access to this topic.");
  const mine = Object.values(jobs())
    .filter((j) => j.ownerId === user.id && j.scope.topicId === topicId && j.scope.subId === subId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || seqOf(b.id) - seqOf(a.id));
  if (!mine.length) throw new HttpError(404, 'insight_not_found', 'No insights yet for this topic.');
  return toResult(mine[0]);
}

export function setHelpful(id: string, helpful: unknown, user: User): InsightResult {
  const j = getStored(id, user);
  if (typeof helpful !== 'boolean') throw new HttpError(400, 'invalid_feedback', 'helpful must be true or false.');
  j.helpful = helpful;
  save();
  return toResult(j);
}

export const REPORT_REASONS = ['Finding not supported by the notes', 'Important issue missing', 'Wrong or sensitive content', 'Other'];

export function reportInsight(id: string, reason: unknown, details: unknown, user: User): { ref: string; result: InsightResult } {
  const j = getStored(id, user);
  if (typeof reason !== 'string' || !REPORT_REASONS.includes(reason)) throw new HttpError(400, 'invalid_reason', 'Choose a reason.');
  const ref = nextId('RPT-AI-');
  j.reports.push({ ref, reason, details: String(details ?? '').slice(0, 2000), by: user.id, at: new Date().toISOString() });
  save();
  return { ref, result: toResult(j) };
}

/**
 * Used by GET /api/notes?insight=&issue= to list the supporting notes of one finding.
 */
export function findingNoteIds(insightId: string, issue: number): { title: string; ids: string[] } | null {
  const j = jobs()[insightId];
  const i = j?.issues?.[issue];
  return i ? { title: i.title, ids: [...i.ids] } : null;
}
