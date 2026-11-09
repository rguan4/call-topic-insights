import type { DigestStatus, Filters, TopicDetailResponse, TopicSort, TopicTrend, TopicsResponse, User } from '@cti/shared';
import { DOW, RANGES, dOff, fmt, fmtS } from '../data/dates';
import { PARENT, SUB, TEAMS, subName, type ParentDef, type SubDef } from '../data/catalog';
import { dayCounts, notesOf } from '../data/notes';
import { state } from '../data/state';
import { canRead } from '../auth';
import { HttpError } from '../errors';
import { scopeInfo } from '../filters';
import {
  changePct, companyTotal, parentCount, parentPrev, parentsInScope, pct, scopeTotals, subCount, subPrev, topicSummary
} from './metrics';
import { noteRow } from './notes';

export function listTopics(f: Filters, q: string, sort: TopicSort): TopicsResponse {
  const totals = scopeTotals(f);
  const all = parentsInScope(f);
  const needle = q.trim().toLowerCase();
  const matches = all.filter(
    (p) => !needle || p.name.toLowerCase().includes(needle) || p.subs.some((s) => subName(s, f.version).toLowerCase().includes(needle))
  );
  const items = matches.map((p) => topicSummary(p, f, totals.notes));
  if (sort === 'notes') items.sort((a, b) => b.notes - a.notes);
  if (sort === 'change') items.sort((a, b) => b.changePct - a.changePct);
  if (sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  return { scope: scopeInfo(f), scopeNotes: totals.notes, totalTopics: all.length, q, sort, topics: items };
}

/** Resolve a topic and optional subtopic, enforcing read access. */
export function resolveTopic(topicId: string, subParam: string | undefined, user: User): { p: ParentDef; s: SubDef | null } {
  const p = PARENT[topicId];
  if (!p) throw new HttpError(404, 'topic_not_found', `Topic “${topicId}” doesn't exist.`);
  if (!canRead(user, p.team)) throw new HttpError(403, 'forbidden_team', `“${p.name}” is owned by ${TEAMS[p.team]}, which is outside your access.`);
  if (!subParam || subParam === 'all') return { p, s: null };
  const s = SUB[subParam];
  if (!s || s.parentId !== p.id) throw new HttpError(404, 'subtopic_not_found', `Subtopic “${subParam}” isn't part of ${p.name}.`);
  return { p, s };
}

export function trendFor(p: ParentDef, s: SubDef | null, f: Filters): TopicTrend {
  const days = RANGES[f.range].days;
  const sum = (subs: SubDef[]) => {
    const daily = new Array<number>(90).fill(0);
    for (const x of subs) dayCounts(x).slice(0, 90).forEach((v, d) => { daily[d] += v; });
    return daily;
  };
  const parentDaily = sum(p.subs);
  const subDaily = s ? sum([s]) : null;
  const points: TopicTrend['points'] = [];
  const bucket = (daily: number[]) => {
    const out: number[] = [];
    if (f.range === '90d') {
      for (let g = 0; g < 13; g++) {
        const start = 89 - 7 * g;
        const end = Math.max(0, start - 6);
        let t = 0;
        for (let d = end; d <= start; d++) t += daily[d];
        out.push(t);
      }
    } else {
      for (let d = days - 1; d >= 0; d--) out.push(daily[d]);
    }
    return out;
  };
  if (f.range === '90d') {
    for (let g = 0; g < 13; g++) {
      const start = 89 - 7 * g;
      const end = Math.max(0, start - 6);
      points.push({ label: fmtS(dOff(start)), tooltip: `Week of ${fmt(dOff(start))}${start - end < 6 ? ` (${start - end + 1} days)` : ''}` });
    }
  } else {
    for (let d = days - 1; d >= 0; d--) {
      const dt = dOff(d);
      points.push({ label: fmtS(dt), tooltip: `${DOW[dt.getUTCDay()]}, ${fmt(dt)}` });
    }
  }
  const weekly = f.range === '90d';
  return {
    unit: weekly ? 'Support notes per week' : 'Support notes per day',
    xUnit: weekly ? 'Week starting (2026)' : 'Date (2026, PT)',
    periodHeader: weekly ? 'Week starting' : 'Day',
    points,
    sub: subDaily ? bucket(subDaily) : null,
    parent: bucket(parentDaily)
  };
}

export function digestKey(user: User, topicId: string, subId: string) {
  return `${user.id}:${topicId}:${subId}`;
}

export function digestStatus(user: User, topicId: string, subId: string): DigestStatus {
  const d = state.digests[digestKey(user, topicId, subId)];
  if (!d) return { subscribed: false, frequency: null, firstSend: null };
  return { subscribed: true, frequency: d.frequency, firstSend: firstSend(d.frequency) };
}

export function firstSend(frequency: 'weekly' | 'daily'): string {
  return frequency === 'weekly' ? 'Monday, Nov 16, 2026, 8:00 AM PT' : 'Tuesday, Nov 10, 2026, 8:00 AM PT';
}

export function topicDetail(f: Filters, user: User, topicId: string, subParam?: string): TopicDetailResponse {
  const { p, s } = resolveTopic(topicId, subParam, user);
  const days = RANGES[f.range].days;
  const pNotes = parentCount(p, f);
  const pPrev = parentPrev(p, f);
  const company = companyTotal(f);
  const scopeSubs = s ? [s] : p.subs;
  const pool = scopeSubs.flatMap((x) => notesOf(x).filter((n) => n.off < days));
  const typical = [...pool].sort((a, b) => b.similarity - a.similarity || a.off - b.off).slice(0, 3);
  return {
    scope: scopeInfo(f),
    topic: {
      id: p.id,
      name: p.name,
      team: p.team,
      teamLabel: TEAMS[p.team],
      notes: pNotes,
      prevNotes: pPrev,
      changePct: changePct(pNotes, pPrev),
      sharePctOfCompany: pct(pNotes, company),
      companyNotes: company
    },
    sub: s
      ? {
          id: s.id,
          name: subName(s, f.version),
          notes: subCount(s, f),
          prevNotes: subPrev(s, f),
          changePct: changePct(subCount(s, f), subPrev(s, f)),
          sharePctOfTopic: pct(subCount(s, f), pNotes)
        }
      : null,
    subtopics: p.subs.map((x) => ({
      id: x.id,
      name: subName(x, f.version),
      notes: subCount(x, f),
      prevNotes: subPrev(x, f),
      changePct: changePct(subCount(x, f), subPrev(x, f)),
      sharePct: pct(subCount(x, f), pNotes)
    })),
    scopeNotes: pool.length,
    typical: typical.map((n) => noteRow(n, f.version)),
    trend: trendFor(p, s, f),
    digest: digestStatus(user, p.id, s ? s.id : 'all')
  };
}
