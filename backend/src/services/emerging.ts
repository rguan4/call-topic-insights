import type {
  CandidateDecisionRequest, CandidateDecisionResponse, CandidateDetail, CandidateStatus, CandidateSummary,
  EmergingResponse, Filters, RangeKey, TaskInfo, TaskKind, TaskStatus, User
} from '@cti/shared';
import { NO_TOPIC_THRESHOLD_PCT, PARENT, SUB, TOPICS, subName } from '../data/catalog';
import { RANGES, span } from '../data/dates';
import { registerExtraNote } from '../data/notes';
import { onReset, save, state } from '../data/state';
import { HttpError } from '../errors';
import { addDraftChange, onDraftChangeRemoved } from './labels';
import { companyTotal, noSuitableTopic, pct } from './metrics';

/**
 * Owner: emerging topics service.
 * Candidate topics come from notes with no suitable topic. Discovery only proposes
 * candidates; the taxonomy changes only after a draft is reviewed and published
 * (label management service).
 */

// ---------------------------------------------------------------- catalog

interface CandidateDef {
  id: string;
  name: string;
  description: string;
  notes: number;
  range: string;
  parentId: string;
  trend: 'Growing' | 'Steady' | 'New';
  closest: [string, number][];
  repNotes: [string, string, string, string][];
}

const CANDIDATES: Record<string, CandidateDef> = {
  bond: {
    id: 'bond',
    name: 'Bond ladder setup questions',
    description: 'Clients setting up a bond ladder ask when rungs are bought, how settlement works, and how to change the ladder after it starts.',
    notes: 412,
    range: 'Oct 22 – Nov 7, 2026',
    parentId: 'invest',
    trend: 'Growing',
    closest: [['bond-port', 0.84], ['risk', 0.71], ['wd-timing', 0.52]],
    repNotes: [
      ['SN-731204', 'Nov 6, 2026', '2:14 PM PT', "Client asked why the new bond ladder hasn't bought its first rung yet. Explained the funds need to settle before purchases start."],
      ['SN-731188', 'Nov 4, 2026', '10:41 AM PT', 'Asked how to change the end year of a bond ladder after it was set up.'],
      ['SN-730962', 'Oct 28, 2026', '3:05 PM PT', 'Client wanted to know what happens to the ladder when a bond matures.']
    ]
  },
  paper: {
    id: 'paper',
    name: 'Paper statement requests',
    description: 'Clients asking for mailed or printed statements, often for a mortgage or loan application.',
    notes: 168,
    range: 'Sep 30 – Nov 7, 2026',
    parentId: 'statements',
    trend: 'Steady',
    closest: [['stmt-download', 0.79], ['acct-letters', 0.74], ['tax-1099', 0.58]],
    repNotes: [
      ['SN-729417', 'Nov 5, 2026', '11:20 AM PT', 'Client needs mailed copies of monthly statements for a mortgage application. Explained how to download and print them.'],
      ['SN-728830', 'Oct 30, 2026', '9:12 AM PT', 'Asked if paper statements can be mailed every month instead of electronic delivery.'],
      ['SN-726105', 'Oct 12, 2026', '4:48 PM PT', 'Lender asked for a stamped statement. Explained verification letters are available on request.']
    ]
  },
  billpay: {
    id: 'billpay',
    name: 'Bill pay timing questions',
    description: 'Clients asking when scheduled bill payments leave the account and why a payment is still pending.',
    notes: 96,
    range: 'Oct 27 – Nov 7, 2026',
    parentId: 'cash',
    trend: 'New',
    closest: [['wd-timing', 0.66], ['cash-features', 0.63], ['check-status', 0.55]],
    repNotes: [
      ['SN-733012', 'Nov 7, 2026', '1:33 PM PT', 'Client asked when a scheduled bill payment will leave the account.'],
      ['SN-732870', 'Nov 6, 2026', '10:02 AM PT', 'Asked why a bill payment shows as pending two days after the scheduled date.'],
      ['SN-732655', 'Nov 3, 2026', '2:47 PM PT', 'Client wanted to change the delivery date of a recurring bill payment.']
    ]
  }
};

// Representative notes open in the shared note drawer.
for (const c of Object.values(CANDIDATES)) {
  for (const [id, date, time, text] of c.repNotes) {
    registerExtraNote({
      id, date, time, excerpt: text, full: `${text} Client said that answered the question.`,
      label: `No suitable topic (candidate: ${c.name})`, handling: 'Resolved during the call'
    });
  }
}

const PENDING_CLASSIFICATION = 214;
const FAILED_BATCH = 37;
const DISMISS_REASONS = ['Not a distinct client issue', 'Too few notes to act on', 'Duplicate or test notes', 'Other'];

// ---------------------------------------------------------------- state slice

interface CandidateState {
  status: CandidateStatus;
  name?: string;
  description?: string;
  parentId?: string;
  decision?: CandidateDetail['decision'];
}

interface TaskRec {
  id: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  progress: number;
  meta: string;
  time: string;
  error: TaskInfo['error'];
  /** Ticks spent queued, used by the simulated runner. */
  ticks?: number;
  startedAt?: string;
}

interface EmergingSlice {
  candidates: Record<string, CandidateState>;
  order: string[];
  tasks: TaskRec[];
  failedCount: number;
  seq: number;
}

function seed(): EmergingSlice {
  return {
    candidates: { bond: { status: 'review' }, paper: { status: 'review' } },
    order: ['bond', 'paper'],
    failedCount: FAILED_BATCH,
    seq: 3,
    tasks: [
      {
        id: 'task-1', kind: 'classify', title: 'Classification batch · Nov 7, 2026', status: 'failed', progress: 64,
        meta: '37 support notes could not be classified',
        time: 'Started Nov 8, 2026, 5:40 AM PT · failed 5:52 AM PT',
        error: {
          code: 'EMB-504', message: 'Embedding service timed out (HTTP 504)', attempts: '3 of 3',
          affected: '37 support notes, Nov 7, 2026',
          hint: 'Usually temporary. Retrying reprocesses only these 37 notes; no other notes change.'
        }
      },
      {
        id: 'task-2', kind: 'discovery', title: 'Topic discovery · Nov 6, 2026', status: 'completed', progress: 100,
        meta: 'Found 2 candidate topics in 1,412 notes with no suitable topic',
        time: 'Ran Nov 6, 2026, 2:00 AM PT · took 9 min', error: null
      }
    ]
  };
}

function slice(): EmergingSlice {
  const s = state.emerging as Partial<EmergingSlice>;
  if (!s.candidates || !s.order || !s.tasks) Object.assign(s, seed());
  return s as EmergingSlice;
}

// ---------------------------------------------------------------- helpers

const STATUS_LABEL: Record<CandidateStatus, string> = {
  review: 'Needs review',
  draft: 'In draft v8',
  merged: 'Merge in draft v8',
  dismissed: 'Dismissed'
};

function nowPT(): string {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }) + ' PT';
}

function candidateState(id: string): CandidateState {
  const s = slice();
  const c = s.candidates[id];
  if (!c) throw new HttpError(404, 'candidate_not_found', `Candidate ${id} doesn't exist.`);
  return c;
}

function summary(id: string): CandidateSummary {
  const def = CANDIDATES[id];
  const st = candidateState(id);
  const parentId = st.parentId ?? def.parentId;
  return {
    id,
    name: st.name ?? def.name,
    description: st.description ?? def.description,
    notes: def.notes,
    range: def.range,
    suggestedParentId: parentId,
    suggestedParentName: PARENT[parentId]?.name ?? parentId,
    trend: def.trend,
    status: st.status,
    statusLabel: STATUS_LABEL[st.status],
    sample: def.repNotes[0][3]
  };
}

export function candidateDetail(id: string): CandidateDetail {
  if (!CANDIDATES[id]) throw new HttpError(404, 'candidate_not_found', `Candidate ${id} doesn't exist.`);
  const def = CANDIDATES[id];
  const st = candidateState(id);
  return {
    ...summary(id),
    closest: def.closest.map(([subId, similarity]) => {
      const s = SUB[subId];
      return { subId, name: subName(s, state.activeVersion), parentId: s.parentId, parentName: PARENT[s.parentId].name, similarity };
    }),
    representativeNotes: def.repNotes.map(([nid, date, time, excerpt]) => ({ id: nid, date, time, excerpt })),
    decision: st.decision ?? null,
    parents: TOPICS.map((p) => ({ id: p.id, name: p.name }))
  };
}

function taskInfo(t: TaskRec): TaskInfo {
  return {
    id: t.id, kind: t.kind, title: t.title, status: t.status, progress: t.progress, meta: t.meta, time: t.time,
    error: t.error, retryable: t.status === 'failed'
  };
}

// ---------------------------------------------------------------- public API

/** Used by Overview and the sidebar badge. */
export function candidatesNeedingReview(): number {
  return Object.values(slice().candidates).filter((c) => c.status === 'review').length;
}

export function parseRange(raw: unknown): RangeKey {
  const r = String(raw ?? '30d') as RangeKey;
  if (!(r in RANGES)) throw new HttpError(400, 'invalid_range', `Unknown date range "${r}".`);
  return r;
}

export function emergingOverview(range: RangeKey): EmergingResponse {
  const s = slice();
  const f: Filters = { range, version: state.activeVersion, team: 'all' };
  const total = companyTotal(f);
  const noTopic = noSuitableTopic(f);
  const days = RANGES[range].days;
  return {
    companyWide: true,
    range,
    span: span(days - 1, 0),
    pendingClassification: PENDING_CLASSIFICATION,
    processingFailed: s.failedCount,
    noSuitableTopic: noTopic,
    noSuitableTopicPct: pct(noTopic, total),
    totalNotes: total,
    thresholdPct: NO_TOPIC_THRESHOLD_PCT,
    candidates: s.order.map(summary),
    tasks: listTasks(),
    discoveryRunning: s.tasks.some((t) => t.kind === 'discovery' && (t.status === 'queued' || t.status === 'running'))
  };
}

export function listTasks(): TaskInfo[] {
  return slice().tasks.map(taskInfo);
}

export function decide(id: string, body: CandidateDecisionRequest, user: User): CandidateDecisionResponse {
  const def = CANDIDATES[id];
  if (!def) throw new HttpError(404, 'candidate_not_found', `Candidate ${id} doesn't exist.`);
  const st = candidateState(id);
  if (st.status !== 'review') throw new HttpError(409, 'already_decided', 'This candidate already has a decision.');

  const name = String(body.name ?? st.name ?? def.name).trim();
  const description = String(body.description ?? st.description ?? def.description).trim();
  const parentId = String(body.parentId ?? st.parentId ?? def.parentId);
  const at = nowPT();

  if (body.action === 'add') {
    if (!name) throw new HttpError(400, 'invalid_name', 'Enter a name for the new topic.');
    if (!PARENT[parentId]) throw new HttpError(400, 'invalid_parent', 'Choose a parent topic.');
    const parentName = PARENT[parentId].name;
    const change = addDraftChange({
      type: 'Added', title: name, detail: `New subtopic under ${parentName}`,
      affected: `${def.notes.toLocaleString('en-US')} notes now marked “No suitable topic” would be assigned`,
      affectedNotes: def.notes, reason: description, parentId, candidateId: id
    }, user);
    const text = `“${name}” was added to draft v8 under ${parentName}.`;
    Object.assign(st, { status: 'draft', name, description, parentId, decision: { action: 'add', by: user.name, at, reason: null, draftChangeId: change.id, text } });
    save();
    return { candidate: candidateDetail(id), message: text, draftChangeId: change.id };
  }

  if (body.action === 'merge') {
    const target = body.targetSubId ? SUB[body.targetSubId] : undefined;
    if (!target) throw new HttpError(400, 'invalid_target', 'Choose a topic to merge into.');
    const targetName = subName(target, state.activeVersion);
    const change = addDraftChange({
      type: 'Merged', title: `${name} → ${targetName}`, detail: `Candidate merged into ${PARENT[target.parentId].name}`,
      affected: `${def.notes.toLocaleString('en-US')} notes would be assigned to ${targetName}`,
      affectedNotes: def.notes, reason: '', targetSubId: target.id, candidateId: id
    }, user);
    const text = `Merge into “${targetName}” was added to draft v8.`;
    Object.assign(st, { status: 'merged', name, description, parentId, decision: { action: 'merge', by: user.name, at, reason: null, draftChangeId: change.id, text } });
    save();
    return { candidate: candidateDetail(id), message: text, draftChangeId: change.id };
  }

  if (body.action === 'dismiss') {
    const reason = String(body.reason ?? '');
    if (!DISMISS_REASONS.includes(reason)) throw new HttpError(400, 'reason_required', 'Choose a reason for dismissing.');
    const comment = String(body.comment ?? '').trim().slice(0, 500);
    const full = comment ? `${reason} · ${comment}` : reason;
    const text = `Candidate dismissed: ${reason}. It won't be proposed again unless note volume changes.`;
    Object.assign(st, { status: 'dismissed', decision: { action: 'dismiss', by: user.name, at, reason: full, draftChangeId: null, text } });
    save();
    return { candidate: candidateDetail(id), message: text, draftChangeId: null };
  }

  throw new HttpError(400, 'invalid_action', 'Choose add, merge or dismiss.');
}

// When a candidate's draft change is removed in label management, the candidate needs review again.
onDraftChangeRemoved((c) => {
  if (!c.candidateId) return;
  const st = slice().candidates[c.candidateId];
  if (!st || (st.status !== 'draft' && st.status !== 'merged')) return;
  st.status = 'review';
  delete st.decision;
  save();
});

// ---------------------------------------------------------------- simulated task runner

const timers = new Map<string, ReturnType<typeof setTimeout>>();
function tickMs(): number {
  if (process.env.CTI_TASK_TICK_MS) return Number(process.env.CTI_TASK_TICK_MS);
  return process.env.NODE_ENV === 'test' || process.env.VITEST ? 5 : 400;
}

onReset(() => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
});

function findTask(id: string): TaskRec {
  const t = slice().tasks.find((x) => x.id === id);
  if (!t) throw new HttpError(404, 'task_not_found', `Task ${id} doesn't exist.`);
  return t;
}

function schedule(t: TaskRec, onDone: (t: TaskRec) => void): void {
  const step = () => {
    timers.delete(t.id);
    const live = slice().tasks.find((x) => x.id === t.id);
    if (!live) return;
    if (live.status === 'queued') {
      live.ticks = (live.ticks ?? 0) + 1;
      if (live.ticks >= 2) {
        live.status = 'running';
        live.startedAt = nowPT();
        live.time = `Started ${live.startedAt}`;
      }
    } else if (live.status === 'running') {
      live.progress = Math.min(100, live.progress + 20);
      live.meta = `${live.kind === 'classify' ? 'Reprocessing 37 support notes' : 'Grouping notes with no suitable topic'} · ${live.progress}%`;
      if (live.progress >= 100) {
        onDone(live);
        save();
        return;
      }
    } else {
      return;
    }
    save();
    timers.set(t.id, setTimeout(step, tickMs()));
  };
  timers.set(t.id, setTimeout(step, tickMs()));
}

function startClassifyRetry(t: TaskRec): void {
  Object.assign(t, { status: 'queued', progress: 0, ticks: 0, error: null, meta: 'Queued · 37 support notes', time: `Queued ${nowPT()}` });
  schedule(t, (live) => {
    const s = slice();
    live.status = 'completed';
    live.meta = 'Reprocessed 37 notes: 29 assigned to topics, 8 with no suitable topic';
    live.time = `Finished ${nowPT()}`;
    s.failedCount = 0;
    state.noTopicExtra += 8;
  });
}

function startDiscovery(t: TaskRec): void {
  Object.assign(t, { status: 'queued', progress: 0, ticks: 0, error: null, meta: 'Queued · input: notes with no suitable topic', time: `Queued ${nowPT()}` });
  schedule(t, (live) => {
    const s = slice();
    if (process.env.CTI_DISCOVERY_FAIL === '1') {
      live.status = 'failed';
      live.progress = 60;
      live.meta = 'Stopped before any candidates were created';
      live.time = `Failed ${nowPT()}`;
      live.error = {
        code: 'DSC-118', message: 'The clustering job ran out of memory', attempts: '1 of 1',
        affected: 'No candidates were created or changed',
        hint: 'Retrying runs discovery again on the same input.'
      };
      return;
    }
    const hasBillpay = s.order.includes('billpay');
    live.status = 'completed';
    live.time = `Finished ${nowPT()}`;
    if (!hasBillpay) {
      s.order.push('billpay');
      s.candidates.billpay = { status: 'review' };
      live.meta = 'Found 1 new candidate topic for review';
    } else {
      live.meta = 'No new candidates; existing candidates refreshed';
    }
  });
}

export function retryTask(id: string): TaskInfo {
  const t = findTask(id);
  if (t.status !== 'failed') throw new HttpError(409, 'not_retryable', 'Only failed tasks can be retried.');
  if (t.kind === 'classify') startClassifyRetry(t);
  else startDiscovery(t);
  save();
  return taskInfo(t);
}

export function runDiscovery(): TaskInfo {
  const s = slice();
  if (s.tasks.some((t) => t.kind === 'discovery' && (t.status === 'queued' || t.status === 'running'))) {
    throw new HttpError(409, 'discovery_running', 'Topic discovery is already running.');
  }
  s.seq += 1;
  const t: TaskRec = {
    id: `task-${s.seq}`, kind: 'discovery', title: `Topic discovery · ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' })}`,
    status: 'queued', progress: 0, meta: '', time: '', error: null
  };
  s.tasks.unshift(t);
  startDiscovery(t);
  save();
  return taskInfo(t);
}

/** After a restart, keep any task that was in flight moving. */
export function resumeTasks(): void {
  for (const t of slice().tasks) {
    if ((t.status === 'queued' || t.status === 'running') && !timers.has(t.id)) {
      if (t.kind === 'classify') schedule(t, () => startClassifyRetryDone(t));
      else {
        const progress = t.progress;
        const status = t.status;
        startDiscovery(t);
        t.progress = progress;
        t.status = status;
      }
    }
  }
}
function startClassifyRetryDone(live: TaskRec): void {
  live.status = 'completed';
  live.meta = 'Reprocessed 37 notes: 29 assigned to topics, 8 with no suitable topic';
  live.time = `Finished ${nowPT()}`;
  slice().failedCount = 0;
  state.noTopicExtra += 8;
}
