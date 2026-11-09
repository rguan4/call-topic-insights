import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { OverviewResponse } from '@cti/shared';
import { apiGet } from '../api/client';
import { FilterBar } from '../components/FilterBar';
import { ErrorState, PageSkeleton } from '../components/States';
import { BarList } from '../components/charts/BarList';
import { LineChart } from '../components/charts/LineChart';
import { useFilters } from '../hooks/useFilters';
import { changeText, num, pctText } from '../lib/format';

export default function Overview() {
  const { filters, search } = useFilters();
  const q = useQuery({
    queryKey: ['overview', filters],
    queryFn: () => apiGet<OverviewResponse>('/overview', filters),
    placeholderData: keepPreviousData
  });

  return (
    <>
      <FilterBar scopeSpan={q.data?.scope.span} prevSpan={q.data?.scope.prevSpan} />
      {q.isPending && <PageSkeleton />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && <OverviewBody data={q.data} search={search} refreshing={q.isPlaceholderData && q.isFetching} />}
    </>
  );
}

function OverviewBody({ data, search, refreshing }: { data: OverviewResponse; search: string; refreshing: boolean }) {
  const { scope, inScope, companyWide } = data;
  const topicLink = (id: string, sub?: string) => `/topics/${id}${sub ? `/${sub}` : ''}${search}`;

  return (
    <div className={refreshing ? 'refreshing' : undefined} aria-busy={refreshing} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {refreshing && <span role="status" className="sr-only">Updating for the new filters</span>}
      <div>
        <h1 className="page-title">Overview</h1>
        <p className="page-sub">{scope.teamLabel} · {scope.span} · taxonomy {scope.version}</p>
      </div>

      <div className="row">
        <section aria-labelledby="ov-scope" style={{ flex: '3 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="ov-scope" className="group-label">{scope.teamLabel} · {scope.span}</h2>
          <div className="auto-grid" style={{ flex: 1 }}>
            <div className="kpi">
              <div className="kpi-label">Support notes</div>
              <div className="kpi-value serif">{num(inScope.notes)}</div>
              <div className="kpi-note">{changeText(inScope.changePct)} vs prior period ({num(inScope.prevNotes)})</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Topics</div>
              <div className="kpi-value">{inScope.topicCount}</div>
              <div className="kpi-note">{inScope.topicNote}</div>
            </div>
            {inScope.fastest && (
              <Link className="kpi" style={{ textDecoration: 'none' }} to={topicLink(inScope.fastest.parentId, inScope.fastest.id)}>
                <div className="kpi-label">Fastest-growing subtopic</div>
                <div style={{ marginTop: 6, fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{inScope.fastest.name}</div>
                <div className="kpi-note" style={{ color: '#8A4A16', fontWeight: 600 }}>
                  {changeText(inScope.fastest.changePct)} · {num(inScope.fastest.prevNotes)} → {num(inScope.fastest.notes)} notes
                </div>
              </Link>
            )}
          </div>
        </section>
        <section aria-labelledby="ov-global" style={{ flex: '2 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 id="ov-global" className="group-label">Company-wide · all teams</h2>
          <div className="auto-grid" style={{ flex: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <Link className="kpi warm" style={{ textDecoration: 'none' }} to={`/emerging${search}`}>
              <div className="kpi-label">No suitable topic</div>
              <div className="kpi-value">{pctText(companyWide.noSuitableTopicPct)}</div>
              <div className="kpi-note">{num(companyWide.noSuitableTopic)} of {num(companyWide.totalNotes)} notes · threshold {companyWide.thresholdPct}%</div>
            </Link>
            <Link className="kpi global" style={{ textDecoration: 'none' }} to={`/emerging${search}`}>
              <div className="kpi-label">Candidate topics</div>
              <div className="kpi-value">{companyWide.candidatesNeedingReview}</div>
              <div className="kpi-note" style={{ color: '#4A32B8', fontWeight: 600 }}>Needs review</div>
            </Link>
          </div>
        </section>
      </div>

      <div className="row top">
        <section className="card" style={{ flex: '3 1 520px', minWidth: 0 }}>
          <h2>Support notes by topic</h2>
          <p className="card-caption">
            Support notes in {scope.teamLabel}, {scope.span}. Share = percent of {num(inScope.notes)} notes in this scope.
          </p>
          <BarList
            rows={data.topics.map((t) => ({
              id: t.id,
              name: t.name,
              sub: `${t.teamLabel} · ${t.subtopicCount} subtopics`,
              value: t.notes,
              share: pctText(t.sharePct),
              tooltip: `${num(t.notes)} notes · ${pctText(t.sharePct)} of ${num(inScope.notes)} in scope · ${changeText(t.changePct)} vs prior period`,
              to: topicLink(t.id, t.largestSubId)
            }))}
          />
          <p className="small muted" style={{ margin: '10px 0 0' }}>{data.othersNote}</p>
        </section>

        <section className="card" style={{ flex: '2 1 320px', minWidth: 0 }}>
          <h2>Biggest changes</h2>
          <p className="card-caption">Subtopics in {scope.teamLabel} · {scope.span} vs {scope.prevSpan}</p>
          <ol style={{ margin: '10px 0 0', padding: 0, listStyle: 'none' }}>
            {data.changes.map((c) => (
              <li key={c.id}>
                <Link className="change-row" to={topicLink(c.parentId, c.id)}>
                  <span>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                    <span className="small muted">{c.parentName} · {num(c.prevNotes)} → {num(c.notes)} notes</span>
                  </span>
                  <span className={`chip ${c.changePct > 0 ? 'chip-warm' : 'chip-violet'}`} style={{ fontSize: 13 }}>{changeText(c.changePct)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {data.historical && (
        <section className="card">
          <span className="chip chip-neutral">
            Historical analysis · {data.historical.span} · Team: {data.historical.teamLabel} · not affected by filters
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
            <div>
              <h2>{data.historical.title}</h2>
              <p className="card-caption">Weekly support notes for two Tax subtopics, taxonomy v7</p>
            </div>
            <div style={{ display: 'flex', gap: 18, fontSize: 13 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 3, background: '#4A32B8', borderRadius: 2 }} />{data.historical.series[0].name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, borderTop: '3px dashed #8F86C9' }} />{data.historical.series[1].name}</span>
            </div>
          </div>
          <LineChart
            points={data.historical.points}
            series={[
              { name: data.historical.series[0].name, values: data.historical.series[0].values, color: '#4A32B8' },
              { name: data.historical.series[1].name, values: data.historical.series[1].values, color: '#8F86C9', dashed: true }
            ]}
            unit={data.historical.unit}
            xUnit="Week of (2026)"
            markers={data.historical.markers}
            tickIndexes={data.historical.tickIndexes}
            periodHeader="Week"
            ariaLabel="Weekly support notes for two tax subtopics, January to May 2026. 1099 notes peak in early February; W-9 notes peak in April before the filing deadline."
          />
        </section>
      )}
    </div>
  );
}
