import type { Filters, SubtopicChange, TopicSummary } from '@cti/shared';
import { RANGES } from '../data/dates';
import { NO_TOPIC_PER_DAY, OTHER_TOPICS, PARENT, TEAMS, TOPICS, subName, type ParentDef, type SubDef } from '../data/catalog';
import { countBetween } from '../data/notes';
import { state } from '../data/state';

export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
export const changePct = (cur: number, prev: number) => (prev ? Math.round((cur / prev - 1) * 1000) / 10 : 0);

export function days(f: Filters) {
  return RANGES[f.range].days;
}
export function subCount(s: SubDef, f: Filters) {
  return countBetween(s, 0, days(f));
}
export function subPrev(s: SubDef, f: Filters) {
  const d = days(f);
  return countBetween(s, d, 2 * d);
}
export function parentCount(p: ParentDef, f: Filters) {
  return p.subs.reduce((a, s) => a + subCount(s, f), 0);
}
export function parentPrev(p: ParentDef, f: Filters) {
  return p.subs.reduce((a, s) => a + subPrev(s, f), 0);
}
export function parentsInScope(f: Filters) {
  return TOPICS.filter((p) => f.team === 'all' || p.team === f.team);
}

/** Notes in the current team scope (includes the 80 smaller topics only for All teams). */
export function scopeTotals(f: Filters) {
  const ps = parentsInScope(f);
  let notes = ps.reduce((a, p) => a + parentCount(p, f), 0);
  let prev = ps.reduce((a, p) => a + parentPrev(p, f), 0);
  if (f.team === 'all') {
    notes += othersNow(f);
    prev += Math.round(othersNow(f) * OTHER_TOPICS.prevFactor);
  }
  return { notes, prev };
}

export function othersNow(f: Filters) {
  return Math.round(OTHER_TOPICS.perDay * days(f));
}

/** Every support note in the range, all teams. */
export function companyTotal(f: Filters) {
  return TOPICS.reduce((a, p) => a + parentCount(p, f), 0) + othersNow(f);
}

export function noSuitableTopic(f: Filters) {
  return Math.round(NO_TOPIC_PER_DAY * days(f)) + state.noTopicExtra;
}

export function topicSummary(p: ParentDef, f: Filters, scopeNotes: number): TopicSummary {
  const notes = parentCount(p, f);
  const prevNotes = parentPrev(p, f);
  return {
    id: p.id,
    name: p.name,
    team: p.team,
    teamLabel: TEAMS[p.team],
    subtopicCount: p.subs.length,
    subtopicNames: p.subs.map((s) => subName(s, f.version)),
    largestSubId: [...p.subs].sort((a, b) => subCount(b, f) - subCount(a, f))[0].id,
    notes,
    prevNotes,
    changePct: changePct(notes, prevNotes),
    sharePct: pct(notes, scopeNotes)
  };
}

export function subChange(s: SubDef, f: Filters): SubtopicChange {
  const notes = subCount(s, f);
  const prevNotes = subPrev(s, f);
  return {
    id: s.id,
    parentId: s.parentId,
    name: subName(s, f.version),
    parentName: PARENT[s.parentId].name,
    notes,
    prevNotes,
    changePct: changePct(notes, prevNotes)
  };
}
