import type { Filters, SearchResponse, SearchTopicHit, User } from '@cti/shared';
import { RANGES } from '../data/dates';
import { PARENT, SUB, TEAMS, subName } from '../data/catalog';
import { notesOf } from '../data/notes';
import { canRead } from '../auth';
import { scopeInfo } from '../filters';
import { subCount } from './metrics';
import { noteRow } from './notes';

/**
 * Concept map that stands in for vector similarity until the embedding pipeline lands.
 * Each concept lists trigger phrases and the subtopics they mean, most relevant first.
 */
const CONCEPTS: { words: string[]; subs: string[] }[] = [
  { words: ['escrow', 'home', 'house', 'closing', 'real estate', 'mortgage', 'title company'], subs: ['wire-re', 'wire-status'] },
  { words: ['wire', 'wiring', 'transfer', 'send money'], subs: ['wire-status', 'wire-re', 'wire-3p', 'wire-in'] },
  { words: ['password', 'login', 'log in', 'locked', 'sign in', "can't get in", 'cant get in'], subs: ['locked', 'login-email'] },
  { words: ['2fa', 'two-factor', 'two factor', 'code', 'device', 'phone'], subs: ['2fa'] },
  { words: ['tax', '1099', 'w9', 'w-9', 'irs'], subs: ['tax-1099', 'tax-w9'] },
  { words: ['check', 'cheque', 'deposit'], subs: ['check-status', 'check-deposit', 'check-stop'] },
  { words: ['rollover', '401k', '401(k)', 'roth', 'ira', 'conversion'], subs: ['401k', 'roth', 'rollover-checks'] },
  { words: ['apy', 'interest', 'rate', 'yield'], subs: ['apy'] },
  { words: ['withdraw', 'withdrawal', 'cash out', 'take out'], subs: ['wd-timing', 'wd-limits'] },
  { words: ['bond', 'ladder', 'portfolio', 'risk'], subs: ['bond-port', 'risk'] },
  { words: ['statement', 'pdf', 'letter', 'paper'], subs: ['stmt-download', 'acct-letters'] }
];

export function search(f: Filters, user: User, q: string): SearchResponse {
  const ql = q.toLowerCase();
  const score: Record<string, number> = {};
  for (const c of CONCEPTS) {
    for (const w of c.words) {
      if (ql.includes(w)) c.subs.forEach((s, k) => { score[s] = (score[s] ?? 0) + 3 - Math.min(k, 2) * 0.5; });
    }
  }
  for (const s of Object.values(SUB)) {
    const name = subName(s, f.version).toLowerCase();
    for (const w of ql.split(/\s+/)) if (w.length > 3 && name.includes(w)) score[s.id] = (score[s.id] ?? 0) + 1;
  }
  const ids = Object.keys(score)
    .filter((id) => {
      const team = PARENT[SUB[id].parentId].team;
      if (!canRead(user, team)) return true; // shown as locked
      return f.team === 'all' || team === f.team;
    })
    .sort((a, b) => score[b] - score[a])
    .slice(0, 6);

  const topics: SearchTopicHit[] = ids.map((id, k) => {
    const s = SUB[id];
    const p = PARENT[s.parentId];
    const locked = !canRead(user, p.team);
    return {
      id: s.id,
      topicId: p.id,
      name: subName(s, f.version),
      parentName: p.name,
      team: p.team,
      teamLabel: TEAMS[p.team],
      locked,
      notes: locked ? null : subCount(s, f),
      score: locked ? null : Math.round((0.93 - k * 0.05) * 100) / 100
    };
  });

  const readable = ids.filter((id) => canRead(user, PARENT[SUB[id].parentId].team));
  const days = RANGES[f.range].days;
  const notes: SearchResponse['notes'] = [];
  readable.slice(0, 2).forEach((id, k) => {
    const s = SUB[id];
    notesOf(s)
      .filter((n) => n.off < days)
      .sort((a, b) => b.similarity - a.similarity || a.off - b.off)
      .slice(0, k === 0 ? 3 : 2)
      .forEach((n) => notes.push({ ...noteRow(n, f.version), score: Math.round((0.91 - notes.length * 0.03) * 100) / 100 }));
  });

  return { scope: scopeInfo(f), q, topics, notes, hiddenTopics: ids.length - readable.length };
}
