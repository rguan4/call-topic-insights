import type { Filters, HistoricalSeries, OverviewResponse } from '@cti/shared';
import { MON, fmt } from '../data/dates';
import { NO_TOPIC_THRESHOLD_PCT, OTHER_TOPICS, TEAMS, TOTAL_TOPICS } from '../data/catalog';
import { candidatesNeedingReview } from './emerging';
import { scopeInfo } from '../filters';
import {
  changePct, companyTotal, noSuitableTopic, othersNow, parentCount, parentsInScope, pct, scopeTotals, subChange, topicSummary
} from './metrics';

export function buildOverview(f: Filters): OverviewResponse {
  const scope = scopeInfo(f);
  const totals = scopeTotals(f);
  const parents = parentsInScope(f).sort((a, b) => parentCount(b, f) - parentCount(a, f));
  const changes = parents.flatMap((p) => p.subs.map((s) => subChange(s, f)));
  const byMagnitude = [...changes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const fastest = [...changes].sort((a, b) => b.changePct - a.changePct)[0] ?? null;
  const subtopics = changes.length;
  const all = companyTotal(f);
  const noTopic = noSuitableTopic(f);

  return {
    scope,
    inScope: {
      notes: totals.notes,
      prevNotes: totals.prev,
      changePct: changePct(totals.notes, totals.prev),
      topicCount: f.team === 'all' ? TOTAL_TOPICS : parents.length,
      topicNote: f.team === 'all' ? `${parents.length} shown in detail · ${OTHER_TOPICS.count} smaller topics` : `${subtopics} subtopics owned by ${TEAMS[f.team]}`,
      fastest
    },
    companyWide: {
      totalNotes: all,
      noSuitableTopic: noTopic,
      noSuitableTopicPct: pct(noTopic, all),
      thresholdPct: NO_TOPIC_THRESHOLD_PCT,
      candidatesNeedingReview: candidatesNeedingReview()
    },
    topics: parents.map((p) => topicSummary(p, f, totals.notes)),
    othersNote: f.team === 'all'
      ? `Showing ${parents.length} of ${TOTAL_TOPICS} topics. The other ${OTHER_TOPICS.count} topics have ${othersNow(f).toLocaleString('en-US')} notes combined.`
      : `Showing every topic owned by ${TEAMS[f.team]}. Company-wide figures are labeled separately.`,
    changes: byMagnitude.slice(0, 5),
    historical: f.team === 'all' || f.team === 'tax' ? taxSeason() : null
  };
}

/** Separate historical analysis: Jan 4 – May 31, 2026, Tax team, not affected by filters. */
function taxSeason(): HistoricalSeries {
  const points: HistoricalSeries['points'] = [];
  const a: number[] = [];
  const b: number[] = [];
  for (let w = 0; w < 22; w++) {
    const d = new Date(Date.UTC(2026, 0, 4) + w * 7 * 864e5);
    points.push({ label: MON[d.getUTCMonth()], tooltip: `Week of ${fmt(d)}` });
    a.push(Math.round(40 + 260 * Math.exp(-((w - 5) ** 2) / (2 * 2.2 * 2.2)) + 8 * Math.sin(w)));
    b.push(Math.round(30 + 190 * Math.exp(-((w - 14) ** 2) / 8) + 6 * Math.cos(w)));
  }
  return {
    title: 'Same filing deadline, different peaks',
    span: 'Jan 4 – May 31, 2026',
    team: 'tax',
    teamLabel: 'Tax',
    unit: 'Support notes per week',
    points,
    series: [{ name: 'Tax Documents and 1099s', values: a }, { name: 'W9 and Tax Forms', values: b }],
    markers: [{ position: 14 + 3 / 7, label: 'Apr 15 filing deadline' }],
    tickIndexes: [0, 4, 8, 13, 17]
  };
}

export { pct };
