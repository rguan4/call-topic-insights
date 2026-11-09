import type { ClassificationStatus, Filters, NoteDetail, NoteRow, NoteSort, NotesResponse, User } from '@cti/shared';
import { RANGES, dOff, fmtS } from '../data/dates';
import { PARENT, SUB, subName } from '../data/catalog';
import { findNote, notesOf, type Note } from '../data/notes';
import { state } from '../data/state';
import { canRead } from '../auth';
import { HttpError } from '../errors';
import { scopeInfo } from '../filters';
import { findingNoteIds } from './insights';
import { subCount } from './metrics';
import { resolveTopic } from './topics';

export function statusOf(n: Note): ClassificationStatus {
  return state.reports[n.id] ? 'Reported' : n.baseStatus;
}

export function noteRow(n: Note, version: string): NoteRow {
  const s = SUB[n.subId];
  const p = PARENT[s.parentId];
  return {
    id: n.id,
    date: n.date,
    time: n.time,
    topicId: p.id,
    subId: s.id,
    topicName: p.name,
    subName: subName(s, version),
    status: statusOf(n),
    excerpt: n.excerpt
  };
}

/** Full note for the drawer. Throws 404/403 when missing or outside the user's access. */
export function noteDetail(id: string, version: string, user: User): NoteDetail {
  const hit = findNote(id);
  if (!hit) throw new HttpError(404, 'note_not_found', `Note ${id} doesn't exist.`);
  if ('extra' in hit) {
    const x = hit.extra;
    return {
      id: x.id, date: x.date, time: x.time, topicId: null, subId: null, topicName: 'No suitable topic', subName: '',
      status: 'No suitable topic', excerpt: x.excerpt, full: x.full, dateTime: `${x.date}, ${x.time}`,
      topicPath: x.label, version, confidence: null, handling: x.handling, report: null, canReport: false
    };
  }
  const n = hit.note;
  const s = SUB[n.subId];
  const p = PARENT[s.parentId];
  if (!canRead(user, p.team)) throw new HttpError(403, 'forbidden_team', "You don't have access to this note.");
  const row = noteRow(n, version);
  const rep = state.reports[n.id];
  return {
    ...row,
    full: n.full,
    dateTime: `${n.date}, ${n.time}`,
    topicPath: `${p.name} › ${row.subName}`,
    version,
    confidence: Math.round(n.confidence * 100) / 100,
    handling: n.handling,
    report: rep ? { ref: rep.ref, reason: rep.reason, at: rep.at } : null,
    canReport: row.status !== 'Reported'
  };
}

// ---------------------------------------------------------------------------
// Notes list
// ---------------------------------------------------------------------------

/** Date buckets inside each range, as [newest offset, oldest offset]. */
export const BUCKETS: Record<Filters['range'], [number, number][]> = {
  '7d': [[0, 1], [2, 3], [4, 6]],
  '30d': [[0, 6], [7, 13], [14, 20], [21, 29]],
  '90d': [[0, 29], [30, 59], [60, 89]]
};

const STATUSES = ['Classified', 'Low confidence', 'Reported'];
const PERS = [10, 25, 50];

export interface NotesParams {
  topic?: string;
  sub?: string;
  date?: string;
  status?: string;
  q?: string;
  sort?: string;
  page?: string;
  per?: string;
  insight?: string;
  issue?: string;
}

export function listNotes(f: Filters, user: User, params: NotesParams): NotesResponse {
  const { p, s } = resolveTopic(params.topic ?? 'wires', params.sub, user);
  const days = RANGES[f.range].days;
  let list = (s ? [s] : p.subs).flatMap((x) => notesOf(x).filter((n) => n.off < days));

  let finding: NotesResponse['finding'] = null;
  if (params.insight && params.issue !== undefined) {
    const hit = findingNoteIds(params.insight, Number(params.issue));
    if (hit) {
      const ids = new Set(hit.ids);
      list = list.filter((n) => ids.has(n.id));
      finding = { title: hit.title, count: hit.ids.length };
    }
  }

  const buckets = BUCKETS[f.range];
  if (params.date && params.date !== 'all') {
    const b = buckets[Number(params.date)];
    if (!b) throw new HttpError(400, 'invalid_date', 'Unknown date filter.');
    list = list.filter((n) => n.off >= b[0] && n.off <= b[1]);
  }
  if (params.status && params.status !== 'all') {
    if (!STATUSES.includes(params.status)) throw new HttpError(400, 'invalid_status', 'Unknown classification status.');
    list = list.filter((n) => statusOf(n) === params.status);
  }
  const q = (params.q ?? '').trim().toLowerCase();
  if (q) list = list.filter((n) => n.excerpt.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));

  const sort = (params.sort ?? 'newest') as NoteSort;
  if (sort === 'newest') list.sort((a, b) => a.off - b.off || a.i - b.i);
  else if (sort === 'oldest') list.sort((a, b) => b.off - a.off || b.i - a.i);
  else if (sort === 'typical') list.sort((a, b) => b.similarity - a.similarity || a.off - b.off);
  else throw new HttpError(400, 'invalid_sort', 'Unknown sort.');

  const per = PERS.includes(Number(params.per)) ? Number(params.per) : 10;
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / per));
  const page = Math.min(Math.max(1, Number(params.page) || 1), pages);

  return {
    scope: scopeInfo(f),
    topic: { id: p.id, name: p.name, team: p.team },
    sub: s ? { id: s.id, name: subName(s, f.version) } : null,
    rows: list.slice((page - 1) * per, page * per).map((n) => noteRow(n, f.version)),
    total,
    page,
    pages,
    per,
    dateOptions: buckets.map((b, k) => ({ id: String(k), label: `${fmtS(dOff(b[1]))} – ${fmtS(dOff(b[0]))}` })),
    subOptions: p.subs.map((x) => ({ id: x.id, name: subName(x, f.version), notes: subCount(x, f) })),
    topicNotes: p.subs.reduce((a, x) => a + subCount(x, f), 0),
    finding
  };
}
