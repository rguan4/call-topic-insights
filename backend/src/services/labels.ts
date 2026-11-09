import type {
  CompareResponse, CompareSide, DraftChange, DraftChangeInput, DraftChangeRequest, DraftsResponse, Filters, PrepStep,
  ReleaseInfo, TaxonomyTopicDetail, TaxonomyTreeResponse, TopicNoteRef, TopicStatusKind, TreeParent, TreeSubtopic,
  User, VersionRecord, VersionsResponse
} from '@cti/shared';
import { PARENT, SUB, TEAMS, TOPICS, subName, type ParentDef, type SubDef } from '../data/catalog';
import { RANGES, span } from '../data/dates';
import { countBetween, notesOf } from '../data/notes';
import { onReset, save, state } from '../data/state';
import { canRead } from '../auth';
import { HttpError } from '../errors';
import { companyTotal } from './metrics';

/**
 * Owner: label management service.
 * Contract used by the emerging topics service (keep signatures): draftChanges, draftChangeCount,
 * addDraftChange(input, user), onDraftChangeRemoved, notifyDraftChangeRemoved.
 */

interface ReleaseState {
  id: string;
  state: 'preparing' | 'ready' | 'active' | 'failed';
  publishedAt: string;
  publishedBy: string;
  changes: DraftChange[];
  historical: 'keep' | 'reprocess';
  /** Index of the step currently running (or failed). 3 = all done. */
  step: number;
  stepTimes: (string | null)[];
  error: { code: string; message: string } | null;
  activatedAt: string | null;
  attempts: number;
}

interface TaxonomySlice {
  drafts?: DraftChange[];
  release?: ReleaseState | null;
  logs?: Record<string, string[]>;
  authors?: Record<string, string>;
  /** version → subtopic ID → name. Read by subName() in data/catalog.ts. */
  publishedRenames?: Record<string, Record<string, string>>;
  /** version → parent ID → name. */
  publishedParentRenames?: Record<string, Record<string, string>>;
}

const slice = () => state.taxonomy as TaxonomySlice;

const SEED_CHANGE: DraftChange = {
  id: 'chg-seed-wire-fees',
  type: 'Renamed',
  subId: 'wire-fees',
  newName: 'Wire fees and transfer limits',
  title: 'Wire fees & limits → Wire fees and transfer limits',
  detail: 'Under Wires and funding methods',
  affected: '',
  affectedNotes: 0,
  author: 'Priya S.',
  authorId: 'priya',
  reason: 'The topic also covers transfer limits, not only fees.',
  editable: false,
  createdAt: '2026-11-04T17:20:00.000Z'
};

const SEED_LOGS: Record<string, string[]> = {
  v7: [
    'Added “Two-factor & device verification”, replacing “Resolved login issues” (outcome moved to handling status)',
    'Added “Wire fees & limits” under Wires and funding methods',
    'Merged “Login help” into “Login/email access issues”'
  ],
  v6: ['Re-clustered all notes from Mar–Jul 2026', 'Renamed 4 subtopics for clarity'],
  v1: ['First clustering: 89 top-level topics']
};
const SEED_AUTHORS: Record<string, string> = { v7: 'Priya S.', v6: 'Priya S.', v1: 'Support Insights team' };

const PREP_STEPS = ['Build topic embeddings for {v}', 'Validate the classifier on 2,000 held-out notes', 'Ready to activate'];

/** Seed defaults the first time (and after a reset). */
function ensureSeeded(): void {
  const t = slice();
  if (!('drafts' in t)) t.drafts = [{ ...SEED_CHANGE, affected: renameAffected(SUB['wire-fees']) }];
  if (!t.logs) t.logs = { ...SEED_LOGS };
  if (!t.authors) t.authors = { ...SEED_AUTHORS };
  if (t.release === undefined) t.release = null;
}

// ---------------------------------------------------------------------------
// Contract with the emerging topics service

export function draftChanges(): DraftChange[] {
  ensureSeeded();
  return slice().drafts ?? [];
}

/** Sidebar badge. */
export function draftChangeCount(): number {
  return draftChanges().length;
}

/** Add a change to the current draft (e.g. from a candidate decision). */
export function addDraftChange(input: DraftChangeInput, user: User): DraftChange {
  ensureSeeded();
  const change: DraftChange = {
    ...input,
    id: `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    author: user.name,
    authorId: user.id,
    editable: true,
    createdAt: new Date().toISOString()
  };
  // One change per candidate: a new decision replaces the previous one.
  const rest = (slice().drafts ?? []).filter((c) => !(input.candidateId && c.candidateId === input.candidateId));
  slice().drafts = [...rest, change];
  save();
  return change;
}

const removedListeners: ((c: DraftChange) => void)[] = [];
/** Called whenever a change is removed from the draft (the emerging service resets the candidate). */
export function onDraftChangeRemoved(fn: (c: DraftChange) => void): void {
  removedListeners.push(fn);
}
export function notifyDraftChangeRemoved(c: DraftChange): void {
  for (const fn of removedListeners) fn(c);
}

// ---------------------------------------------------------------------------
// Helpers

const n90 = (s: SubDef) => countBetween(s, 0, 90);
const parentN90 = (p: ParentDef) => p.subs.reduce((a, s) => a + n90(s), 0);
const fmtNum = (n: number) => n.toLocaleString('en-US');
const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function renameAffected(s: SubDef): string {
  return `No notes reassigned · label text changes on ${fmtNum(n90(s))} notes (last 90 days)`;
}

function nowPT(): string {
  return `${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} PT`;
}

/** Top-level topic name in a version (published parent renames apply). */
export function parentName(p: ParentDef, version: string): string {
  return slice().publishedParentRenames?.[version]?.[p.id] ?? p.name;
}

const DEFS: Record<string, string> = {
  'check-rollover': 'Clients asking how to deposit a rollover check from another provider: whether mobile deposit works and how the check should be made out.',
  'rollover-checks': "Clients rolling a 401(k) or IRA into a new IRA by check: where to mail it, how it's made out, and when the money is invested.",
  'wire-re': 'Clients wiring money for a home purchase, usually to escrow or a title company.',
  'wire-fees': 'Clients asking about outgoing wire fees and daily or per-transfer wire limits.',
  '2fa': "Clients who can't complete two-factor or device verification: new phones, missing or late codes, lost devices."
};

function definition(id: string): string {
  if (DEFS[id]) return DEFS[id];
  if (SUB[id]) return `Support notes where the client asks about ${lcFirst(SUB[id].name)}.`;
  const p = PARENT[id];
  if (p) return `Client issues related to ${lcFirst(p.name)}, grouped into ${p.subs.length} subtopics.`;
  return '';
}

const PAIR = ['check-rollover', 'rollover-checks'];
const DISCLAIMER = "Similarity shows how close the two topics' notes are in meaning. It's a review signal, not the probability that merging is correct. Compare the definitions and notes before deciding.";

function similarity(a: string, b: string): number {
  if (PAIR.includes(a) && PAIR.includes(b) && a !== b) return 0.91;
  return SUB[a] && SUB[b] && SUB[a].parentId === SUB[b].parentId ? 0.62 : 0.38;
}

function topNotes(s: SubDef, k: number): TopicNoteRef[] {
  return [...notesOf(s)]
    .sort((x, y) => y.similarity - x.similarity || x.i - y.i)
    .slice(0, k)
    .map((n) => ({ id: n.id, date: n.date, excerpt: n.excerpt.length > 140 ? `${n.excerpt.slice(0, 137)}…` : n.excerpt }));
}

function changesFor(subId: string): DraftChange[] {
  return draftChanges().filter((c) => c.subId === subId);
}

function pairMergeDrafted(): boolean {
  return draftChanges().some((c) => c.type === 'Merged' && !!c.subId && PAIR.includes(c.subId) && !!c.targetSubId && PAIR.includes(c.targetSubId));
}

type StatusInfo = { status: string; statusKind: TopicStatusKind; note: string | null };

function subStatus(s: SubDef): StatusInfo {
  const ch = changesFor(s.id);
  const merge = ch.find((c) => c.type === 'Merged');
  if (merge) return { status: 'Draft: merging', statusKind: 'merging', note: `Merges into ${SUB[merge.targetSubId ?? '']?.name ?? 'another topic'}` };
  const move = ch.find((c) => c.type === 'Moved');
  if (move) return { status: 'Draft: moved', statusKind: 'moved', note: `Moving from ${PARENT[s.parentId].name} to ${PARENT[move.newParentId ?? '']?.name ?? '?'}` };
  const ren = ch.find((c) => c.type === 'Renamed');
  if (ren) return { status: 'Draft: renamed', statusKind: 'renamed', note: `New name: ${ren.newName}` };
  if (PAIR.includes(s.id) && !pairMergeDrafted()) {
    return { status: 'Looks alike · 0.91', statusKind: 'looksAlike', note: `Similar to ${s.id === 'check-rollover' ? 'Rollover checks' : 'Check rollovers'}` };
  }
  return { status: 'Active', statusKind: 'active', note: null };
}

function parentStatus(p: ParentDef): StatusInfo {
  const ren = draftChanges().find((c) => c.type === 'Renamed' && c.parentId === p.id && !c.subId);
  if (ren) return { status: 'Draft: renamed', statusKind: 'renamed', note: `New name: ${ren.newName}` };
  return { status: 'Active', statusKind: 'active', note: null };
}

function rangeDays(range: unknown): number {
  const key = (typeof range === 'string' && range in RANGES ? range : '30d') as keyof typeof RANGES;
  return RANGES[key].days;
}

// ---------------------------------------------------------------------------
// Tree and topic detail

export function taxonomyTree(rangeParam: unknown, qParam: unknown): TaxonomyTreeResponse {
  ensureSeeded();
  const days = rangeDays(rangeParam);
  const version = state.activeVersion;
  const q = String(qParam ?? '').trim().toLowerCase();
  const drafts = draftChanges();
  let matchCount = 0;
  const parents: TreeParent[] = [];

  for (const p of TOPICS) {
    // Subtopics under this parent: its own (minus drafted moves away) + drafted moves in.
    const subs = p.subs.filter((s) => {
      const mv = drafts.find((c) => c.type === 'Moved' && c.subId === s.id);
      return !mv || mv.newParentId === p.id;
    });
    for (const o of TOPICS) {
      if (o.id === p.id) continue;
      for (const s of o.subs) {
        if (drafts.some((c) => c.type === 'Moved' && c.subId === s.id && c.newParentId === p.id)) subs.push(s);
      }
    }
    const rows: TreeSubtopic[] = subs.map((s) => ({ id: s.id, name: subName(s, version), notes: countBetween(s, 0, days), ...subStatus(s) }));
    for (const c of drafts.filter((d) => d.type === 'Added' && d.parentId === p.id)) {
      rows.push({
        id: c.candidateId ? `candidate:${c.candidateId}` : c.id,
        name: c.newName ?? c.title,
        notes: c.affectedNotes,
        status: 'Draft: new',
        statusKind: 'new',
        note: 'From Emerging topics · currently “No suitable topic”',
        candidateId: c.candidateId,
        draftOnly: true
      });
    }
    const pName = parentName(p, version);
    const pMatch = !q || pName.toLowerCase().includes(q);
    const subMatches = rows.filter((r) => r.name.toLowerCase().includes(q));
    if (q && !pMatch && subMatches.length === 0) continue;
    if (q) matchCount += (pMatch ? 1 : 0) + subMatches.length;
    parents.push({
      id: p.id,
      name: pName,
      team: p.team,
      teamLabel: TEAMS[p.team],
      notes: p.subs.reduce((a, s) => a + countBetween(s, 0, days), 0),
      ...parentStatus(p),
      subtopics: pMatch ? rows : subMatches
    });
  }
  const sp = span(days - 1, 0);
  return { version, span: sp, notesLabel: `Notes: all teams, ${sp}`, parents, matchCount: q ? matchCount : parents.length };
}

export function topicDetail(id: string, rangeParam: unknown, user: User): TaxonomyTopicDetail {
  ensureSeeded();
  const days = rangeDays(rangeParam);
  const version = state.activeVersion;
  const sp = span(days - 1, 0);
  const s = SUB[id];
  if (s) {
    const p = PARENT[s.parentId];
    const otherPair = PAIR.includes(s.id) ? PAIR.find((x) => x !== s.id) ?? null : null;
    const readable = canRead(user, p.team);
    return {
      id: s.id,
      kind: 'subtopic',
      name: subName(s, version),
      path: `${parentName(p, version)} › subtopic`,
      parentId: p.id,
      parentName: parentName(p, version),
      team: p.team,
      teamLabel: TEAMS[p.team],
      definition: definition(s.id),
      span: sp,
      notesInRange: countBetween(s, 0, days),
      notes90: n90(s),
      subtopicCount: null,
      ...subStatus(s),
      similar: otherPair ? { id: otherPair, name: subName(SUB[otherPair], version), similarity: 0.91 } : null,
      notes: readable ? topNotes(s, 2) : [],
      notesHidden: !readable,
      pendingChanges: changesFor(s.id).map((c) => withEditable(c, user)),
      actions: { rename: true, move: true, compare: true, merge: true },
      moveOptions: TOPICS.filter((x) => x.id !== s.parentId).map((x) => ({ id: x.id, name: parentName(x, version) })),
      mergeOptions: TOPICS.flatMap((x) => x.subs.filter((o) => o.id !== s.id).map((o) => ({ id: o.id, label: `${parentName(x, version)} › ${subName(o, version)}` })))
    };
  }
  const p = PARENT[id];
  if (!p) throw new HttpError(404, 'topic_not_found', `Topic ${id} doesn't exist.`);
  return {
    id: p.id,
    kind: 'parent',
    name: parentName(p, version),
    path: 'Top-level topic',
    parentId: null,
    parentName: null,
    team: p.team,
    teamLabel: TEAMS[p.team],
    definition: definition(p.id),
    span: sp,
    notesInRange: p.subs.reduce((a, x) => a + countBetween(x, 0, days), 0),
    notes90: parentN90(p),
    subtopicCount: p.subs.length,
    ...parentStatus(p),
    similar: null,
    notes: [],
    notesHidden: false,
    pendingChanges: draftChanges().filter((c) => c.parentId === p.id && !c.subId && c.type === 'Renamed').map((c) => withEditable(c, user)),
    actions: { rename: true, move: false, compare: false, merge: false },
    moveOptions: [],
    mergeOptions: []
  };
}

function compareSide(s: SubDef, days: number, user: User): CompareSide {
  const p = PARENT[s.parentId];
  return {
    id: s.id,
    name: subName(s, state.activeVersion),
    parentName: parentName(p, state.activeVersion),
    notes: countBetween(s, 0, days),
    definition: definition(s.id),
    sampleNotes: canRead(user, p.team) ? topNotes(s, 2) : []
  };
}

export function compareTopics(a: unknown, b: unknown, rangeParam: unknown, user: User): CompareResponse {
  const sa = SUB[String(a)];
  const sb = SUB[String(b)];
  if (!sa || !sb) throw new HttpError(400, 'invalid_topic', 'Choose two subtopics to compare.');
  if (sa.id === sb.id) throw new HttpError(400, 'same_topic', 'Choose two different subtopics.');
  const days = rangeDays(rangeParam);
  return { a: compareSide(sa, days, user), b: compareSide(sb, days, user), similarity: similarity(sa.id, sb.id), disclaimer: DISCLAIMER };
}

// ---------------------------------------------------------------------------
// Drafts

function withEditable(c: DraftChange, user: User): DraftChange {
  return { ...c, editable: c.authorId === user.id };
}

function releaseInProgress(): boolean {
  const r = slice().release;
  return !!r && (r.state === 'preparing' || r.state === 'ready' || r.state === 'failed');
}

export function draftsFor(user: User): DraftsResponse {
  const changes = draftChanges().map((c) => withEditable(c, user));
  const count = (t: string) => changes.filter((c) => c.type === t).length;
  const missing = changes.some((c) => !c.reason.trim());
  const f: Filters = { range: '90d', version: state.activeVersion, team: 'all' };
  return {
    basedOn: state.activeVersion,
    changes,
    summary: {
      total: changes.length,
      added: count('Added'),
      renamed: count('Renamed'),
      moved: count('Moved'),
      merged: count('Merged'),
      notesReassigned: changes.reduce((a, c) => a + (c.affectedNotes || 0), 0)
    },
    publishBlockedReason: changes.length === 0
      ? 'No changes to publish.'
      : missing
        ? 'Add a reason for every change.'
        : releaseInProgress()
          ? `Finish the ${slice().release?.id ?? ''} release in progress first.`
          : null,
    reprocessEstimate: companyTotal(f)
  };
}

export function createDraftChange(body: DraftChangeRequest, user: User): DraftChange {
  ensureSeeded();
  const reason = String(body?.reason ?? '').trim();
  if (!reason) throw new HttpError(400, 'reason_required', 'Add a reason for this change.');
  const version = state.activeVersion;
  let input: DraftChangeInput;

  if (body.type === 'Renamed') {
    const newName = String(body.newName ?? '').trim();
    if (!newName) throw new HttpError(400, 'name_required', 'Enter a new name.');
    if (newName.length > 80) throw new HttpError(400, 'name_too_long', 'Keep names under 80 characters.');
    if (body.subId) {
      const s = SUB[body.subId];
      if (!s) throw new HttpError(400, 'invalid_topic', 'Unknown subtopic.');
      const old = subName(s, version);
      if (old === newName) throw new HttpError(400, 'same_name', 'The new name is the same as the current one.');
      const p = PARENT[s.parentId];
      if (p.subs.some((o) => o.id !== s.id && subName(o, version).toLowerCase() === newName.toLowerCase())) {
        throw new HttpError(400, 'duplicate_name', `${parentName(p, version)} already has a subtopic with that name.`);
      }
      input = { type: 'Renamed', subId: s.id, newName, title: `${old} → ${newName}`, detail: `Under ${parentName(p, version)}`, affected: renameAffected(s), affectedNotes: 0, reason };
    } else if (body.parentId) {
      const p = PARENT[body.parentId];
      if (!p) throw new HttpError(400, 'invalid_topic', 'Unknown topic.');
      const old = parentName(p, version);
      if (old === newName) throw new HttpError(400, 'same_name', 'The new name is the same as the current one.');
      input = { type: 'Renamed', parentId: p.id, newName, title: `${old} → ${newName}`, detail: 'Top-level topic', affected: `No notes reassigned · parent label changes for ${p.subs.length} subtopics`, affectedNotes: 0, reason };
    } else {
      throw new HttpError(400, 'invalid_topic', 'Choose a topic to rename.');
    }
  } else if (body.type === 'Moved') {
    const s = SUB[body.subId ?? ''];
    if (!s) throw new HttpError(400, 'invalid_topic', 'Only subtopics can be moved.');
    const np = PARENT[body.newParentId ?? ''];
    if (!np) throw new HttpError(400, 'invalid_parent', 'Choose a new parent topic.');
    if (np.id === s.parentId) throw new HttpError(400, 'same_parent', 'The subtopic is already under that topic.');
    const n = n90(s);
    input = {
      type: 'Moved', subId: s.id, newParentId: np.id,
      title: `${subName(s, version)}: ${parentName(PARENT[s.parentId], version)} → ${parentName(np, version)}`,
      detail: 'Subtopic moves to a new parent',
      affected: `${fmtNum(n)} notes change parent topic (last 90 days)`,
      affectedNotes: n, reason
    };
  } else if (body.type === 'Merged') {
    const s = SUB[body.subId ?? ''];
    if (!s) throw new HttpError(400, 'invalid_topic', 'Only subtopics can be merged.');
    const t = SUB[body.targetSubId ?? ''];
    if (!t) throw new HttpError(400, 'invalid_target', 'Choose a topic to merge into.');
    if (t.id === s.id) throw new HttpError(400, 'same_topic', "A topic can't be merged into itself.");
    if (changesFor(t.id).some((c) => c.type === 'Merged')) throw new HttpError(400, 'target_merging', `${subName(t, version)} is already being merged into another topic.`);
    const n = n90(s);
    input = {
      type: 'Merged', subId: s.id, targetSubId: t.id,
      title: `${subName(s, version)} → ${subName(t, version)}`,
      detail: `Into ${parentName(PARENT[t.parentId], version)}`,
      affected: `${fmtNum(n)} notes reassigned to ${subName(t, version)} (last 90 days)`,
      affectedNotes: n, reason
    };
  } else {
    throw new HttpError(400, 'invalid_type', 'Unknown change type.');
  }

  const sameTopic = (c: DraftChange) => c.type === input.type && (input.subId ? c.subId === input.subId : !c.subId && c.parentId === input.parentId);
  const existing = draftChanges().find(sameTopic);
  if (existing && existing.authorId !== user.id) {
    throw new HttpError(409, 'conflict', `${existing.author} already drafted this change. Ask them to update or remove it.`);
  }
  const change: DraftChange = {
    ...input,
    id: existing?.id ?? `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    author: user.name,
    authorId: user.id,
    editable: true,
    createdAt: new Date().toISOString()
  };
  slice().drafts = existing ? draftChanges().map((c) => (c.id === existing.id ? change : c)) : [...draftChanges(), change];
  save();
  return change;
}

function ownChange(id: string, user: User): DraftChange {
  const c = draftChanges().find((x) => x.id === id);
  if (!c) throw new HttpError(404, 'change_not_found', 'That change is no longer in the draft.');
  if (c.authorId !== user.id) throw new HttpError(403, 'not_author', 'Only the author can change this.');
  return c;
}

export function updateDraftReason(id: string, reason: unknown, user: User): DraftChange {
  const c = ownChange(id, user);
  const next = { ...c, reason: String(reason ?? '').slice(0, 500) };
  slice().drafts = draftChanges().map((x) => (x.id === id ? next : x));
  save();
  return withEditable(next, user);
}

export function deleteDraftChange(id: string, user: User): void {
  const c = ownChange(id, user);
  slice().drafts = draftChanges().filter((x) => x.id !== id);
  save();
  notifyDraftChangeRemoved(c);
}

// ---------------------------------------------------------------------------
// Versions, publish and activate

const tick = () => Number(process.env.CTI_PREP_TICK_MS ?? (process.env.VITEST ? 15 : 1600));
let runToken = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();
function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

let resumed = false;
onReset(() => {
  for (const t of timers) clearTimeout(t);
  timers.clear();
  runToken += 1;
  resumed = true;
});

function nextVersionId(): string {
  const max = Math.max(...state.versions.map((v) => Number(v.id.replace(/\D/g, '')) || 0));
  return `v${max + 1}`;
}

function setVersionStatus(id: string, status: (typeof state.versions)[number]['status'], publishedAt?: string) {
  const v = state.versions.find((x) => x.id === id);
  if (v) v.status = status;
  else state.versions.unshift({ id, status, publishedAt: publishedAt ?? null });
}

/** Run (or rerun) preparation from `fromStep`. Steps: embeddings (0) → validation (1) → ready (2). */
function runPreparation(fromStep: number): void {
  const r = slice().release;
  if (!r) return;
  const token = ++runToken;
  r.state = 'preparing';
  r.error = null;
  r.step = fromStep;
  for (let k = fromStep; k < 3; k++) r.stepTimes[k] = null;
  setVersionStatus(r.id, 'preparing');
  save();
  const step = (k: number) => {
    const cur = slice().release;
    if (token !== runToken || !cur || cur.id !== r.id) return;
    if (k === 1 && process.env.CTI_PREP_FAIL === '1' && cur.attempts === 1) {
      cur.state = 'failed';
      cur.step = 1;
      cur.error = {
        code: 'PRP-207',
        message: `Classifier validation scored 0.71, below the 0.80 threshold. ${state.activeVersion} is still active. Retrying uses a larger validation sample.`
      };
      setVersionStatus(cur.id, 'failed');
      save();
      return;
    }
    cur.stepTimes[k] = nowPT();
    if (k >= 1) {
      cur.stepTimes[2] = nowPT();
      cur.step = 3;
      cur.state = 'ready';
      setVersionStatus(cur.id, 'ready');
      save();
      return;
    }
    cur.step = k + 1;
    save();
    later(tick(), () => step(k + 1));
  };
  later(tick(), () => step(fromStep));
}

/** Resume a preparation that was running when the server stopped. */
function resumeIfNeeded() {
  if (resumed) return;
  resumed = true;
  const r = slice().release;
  if (r && r.state === 'preparing') runPreparation(Math.min(r.step, 1));
}

export function publish(historical: unknown, user: User): ReleaseInfo {
  ensureSeeded();
  resumeIfNeeded();
  const h = historical === 'reprocess' ? 'reprocess' : 'keep';
  const block = draftsFor(user).publishBlockedReason;
  if (block) throw new HttpError(409, 'publish_blocked', block);
  const id = nextVersionId();
  const changes = draftChanges().map((c) => ({ ...c, editable: false }));
  const t = slice();
  t.release = {
    id,
    state: 'preparing',
    publishedAt: nowPT(),
    publishedBy: user.name,
    changes,
    historical: h,
    step: 0,
    stepTimes: [null, null, null],
    error: null,
    activatedAt: null,
    attempts: 1
  };
  t.logs = { ...(t.logs ?? {}), [id]: changes.map((c) => `${c.type}: ${c.title}`) };
  t.authors = { ...(t.authors ?? {}), [id]: user.name };
  // Renames show once this version is selected (it becomes selectable after activation).
  const subRenames: Record<string, string> = {};
  const parentRenames: Record<string, string> = {};
  for (const c of changes) {
    if (c.type !== 'Renamed' || !c.newName) continue;
    if (c.subId) subRenames[c.subId] = c.newName;
    else if (c.parentId) parentRenames[c.parentId] = c.newName;
  }
  t.publishedRenames = { ...(t.publishedRenames ?? {}), [id]: subRenames };
  t.publishedParentRenames = { ...(t.publishedParentRenames ?? {}), [id]: parentRenames };
  t.drafts = [];
  setVersionStatus(id, 'preparing', t.release.publishedAt);
  runPreparation(0);
  return releaseInfo() as ReleaseInfo;
}

export function retryPreparation(id: string): ReleaseInfo {
  const r = slice().release;
  if (!r || r.id !== id) throw new HttpError(404, 'release_not_found', `Version ${id} isn't being prepared.`);
  if (r.state !== 'failed') throw new HttpError(409, 'not_failed', 'Preparation only needs a retry after it fails.');
  r.attempts += 1;
  runPreparation(r.step);
  return releaseInfo() as ReleaseInfo;
}

export function activate(id: string): ReleaseInfo {
  const r = slice().release;
  if (!r || r.id !== id) throw new HttpError(404, 'release_not_found', `Version ${id} isn't waiting for activation.`);
  if (r.state !== 'ready') throw new HttpError(409, 'not_ready', 'This version can be activated once its preparation is done.');
  setVersionStatus(state.activeVersion, 'previous');
  setVersionStatus(id, 'active');
  state.activeVersion = id;
  r.state = 'active';
  r.activatedAt = nowPT();
  save();
  return releaseInfo() as ReleaseInfo;
}

function releaseInfo(): ReleaseInfo | null {
  const r = slice().release;
  if (!r) return null;
  const steps: PrepStep[] = PREP_STEPS.map((label, k) => {
    const failed = r.state === 'failed' && k === r.step;
    const done = !failed && (r.state === 'ready' || r.state === 'active' || k < r.step);
    const running = !done && !failed && r.state === 'preparing' && k === r.step;
    return { label: label.replace('{v}', r.id), state: failed ? 'failed' : done ? 'done' : running ? 'running' : 'waiting', at: done ? r.stepTimes[k] : null };
  });
  return {
    id: r.id,
    state: r.state,
    publishedAt: r.publishedAt,
    publishedBy: r.publishedBy,
    changeCount: r.changes.length,
    historical: r.historical,
    steps,
    error: r.error,
    activatedAt: r.activatedAt
  };
}

export function versions(): VersionsResponse {
  ensureSeeded();
  resumeIfNeeded();
  const t = slice();
  const sorted = [...state.versions].sort((a, b) => Number(b.id.replace(/\D/g, '')) - Number(a.id.replace(/\D/g, '')));
  const records: VersionRecord[] = sorted.map((v) => {
    const log = t.logs?.[v.id] ?? [];
    return {
      id: v.id,
      state: v.status,
      publishedAt: v.publishedAt,
      publishedBy: t.authors?.[v.id] ?? null,
      summary: log.length ? `${log.length} change${log.length === 1 ? '' : 's'}` : '',
      log
    };
  });
  return { activeVersion: state.activeVersion, release: releaseInfo(), versions: records, draftCount: draftChangeCount() };
}
