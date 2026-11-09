import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TopicDetailResponse } from '@cti/shared';
import { ApiRequestError, apiGet } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AiInsightsPanel } from '../components/ai/AiInsightsPanel';
import { FilterBar } from '../components/FilterBar';
import { useNoteDrawer } from '../components/NoteDrawer';
import { EmptyState, ErrorState, PageSkeleton } from '../components/States';
import { LineChart } from '../components/charts/LineChart';
import { NoAccess } from '../components/notes/NoAccess';
import { withQuery } from '../components/notes/links';
import { DigestDialog } from '../components/topics/DigestDialog';
import { ExportDialog } from '../components/topics/ExportDialog';
import { useFilters } from '../hooks/useFilters';
import { useMeta } from '../hooks/useMeta';
import { changeText, num, pctText } from '../lib/format';
import '../styles/notes.css';

export default function TopicDetail() {
  const { topicId = '', subId } = useParams();
  const { filters, search } = useFilters();
  const { user } = useAuth();
  const meta = useMeta().data;
  const navigate = useNavigate();

  const topicMeta = meta?.subtopics.find((s) => s.parentId === topicId);
  const outOfTeam = !!topicMeta && user?.role === 'editor' && filters.team !== 'all' && topicMeta.team !== filters.team;

  // When the team filter no longer includes this topic, clear it and go back to the topic list.
  useEffect(() => {
    if (outOfTeam && topicMeta && meta) {
      const team = meta.teams.find((t) => t.id === filters.team)?.label ?? filters.team;
      navigate(withQuery('/topics', search), {
        replace: true,
        state: { notice: `“${topicMeta.parentName}” isn't owned by ${team}, so it was cleared from your selection. Showing ${team} topics instead.` }
      });
    }
  }, [outOfTeam, topicMeta, meta, filters.team, navigate, search]);

  const q = useQuery({
    queryKey: ['topic', topicId, subId ?? 'all', filters],
    queryFn: () => apiGet<TopicDetailResponse>(`/topics/${topicId}`, { ...filters, sub: subId ?? 'all' }),
    placeholderData: keepPreviousData,
    enabled: !outOfTeam,
    retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 1
  });

  if (q.isError && q.error instanceof ApiRequestError && q.error.status === 403) {
    const team = meta?.teams.find((t) => t.id === topicMeta?.team)?.label ?? 'another team';
    return <NoAccess topicName={topicMeta?.parentName ?? topicId} teamName={team} />;
  }

  return (
    <>
      <FilterBar scopeSpan={q.data?.scope.span} prevSpan={q.data?.scope.prevSpan} />
      {q.isPending && <PageSkeleton />}
      {q.isError && q.error instanceof ApiRequestError && q.error.status === 404 && (
        <EmptyState title="Topic not found" action={<Link className="btn btn-primary" style={{ textDecoration: 'none' }} to={withQuery('/topics', search)}>Go to Topics</Link>}>
          {q.error.message}
        </EmptyState>
      )}
      {q.isError && !(q.error instanceof ApiRequestError && q.error.status === 404) && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && <Body d={q.data} subId={subId} refreshing={q.isFetching && q.isPlaceholderData} />}
    </>
  );
}

function Body({ d, subId, refreshing }: { d: TopicDetailResponse; subId?: string; refreshing: boolean }) {
  const { filters, search } = useFilters();
  const { openNote } = useNoteDrawer();
  const navigate = useNavigate();
  const [trendScope, setTrendScope] = useState<'sub' | 'parent'>('sub');
  const [dialog, setDialog] = useState<'export' | 'digest' | null>(null);
  const t = d.topic;
  const isSub = !!d.sub;
  const useParent = !isSub || trendScope === 'parent';
  const scopeLabel = d.sub ? `${t.name} › ${d.sub.name}` : `${t.name} (all subtopics)`;
  const topicUrl = (sub?: string) => withQuery(`/topics/${t.id}${sub ? `/${sub}` : ''}`, search);

  const meta = d.sub
    ? `${num(d.sub.notes)} support notes, ${d.scope.span} · ${pctText(d.sub.sharePctOfTopic)} of ${t.name} · ${changeText(d.sub.changePct)} vs prior period · Owner: ${t.teamLabel}`
    : `${num(t.notes)} support notes, ${d.scope.span} · ${pctText(t.sharePctOfCompany)} of all ${num(t.companyNotes)} notes company-wide · ${changeText(t.changePct)} vs prior period · Owner: ${t.teamLabel}`;

  const values = useParent ? d.trend.parent : d.trend.sub ?? d.trend.parent;
  const trendName = useParent ? `Parent topic: ${t.name} (all ${d.subtopics.length} subtopics)` : `Selected subtopic: ${d.sub?.name}`;

  return (
    <div className={refreshing ? 'refreshing' : undefined} aria-busy={refreshing} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {refreshing && <span role="status" className="sr-only">Updating for the new filters</span>}
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li><Link to={withQuery('/topics', search)}>Topics</Link></li>
          <li aria-hidden="true">/</li>
          <li>
            {isSub ? <Link to={topicUrl()}>{t.name}</Link> : <span aria-current="page" style={{ fontWeight: 600, color: '#1E1640' }}>{t.name}</span>}
          </li>
          {isSub && (
            <>
              <li aria-hidden="true">/</li>
              <li><span aria-current="page" style={{ fontWeight: 600, color: '#1E1640' }}>{d.sub?.name}</span></li>
            </>
          )}
        </ol>
      </nav>

      <div className="page-head">
        <div>
          <div className="eyebrow">{isSub ? t.name : `Topic · ${t.teamLabel}`}</div>
          <h1 className="page-title" style={{ marginTop: 2 }}>{isSub ? d.sub?.name : t.name}</h1>
          <p className="page-sub" style={{ marginTop: 6 }}>{meta}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('export')}>Export CSV</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog('digest')}>
            {d.digest.subscribed ? `${d.digest.frequency === 'daily' ? 'Daily' : 'Weekly'} digest · on` : 'Weekly digest'}
          </button>
        </div>
      </div>

      <section aria-labelledby="sub-h">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <h2 id="sub-h" style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            Subtopics <span className="muted" style={{ fontWeight: 400 }}>· share of {num(t.notes)} notes in {t.name}</span>
          </h2>
          <button type="button" className="select-card" aria-pressed={!isSub} style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600 }} onClick={() => navigate(topicUrl())}>
            All subtopics together
          </button>
        </div>
        <div role="radiogroup" aria-label="Choose a subtopic" className="grid3">
          {d.subtopics.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === subId} className="select-card" onClick={() => navigate(topicUrl(s.id))}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>{num(s.notes)} notes · {pctText(s.sharePct)} of topic</span>
              <span className="muted" style={{ fontSize: 12 }}>{changeText(s.changePct)} vs prior period</span>
            </button>
          ))}
        </div>
      </section>

      <div className="two-col">
        <div className="main-col">
          <section className="card">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h2>Trend</h2>
                <p className="card-caption">{trendName} · {d.scope.span}</p>
              </div>
              {isSub && (
                <div role="group" aria-label="Chart scope" className="segmented">
                  <button type="button" aria-pressed={!useParent} onClick={() => setTrendScope('sub')}>Selected subtopic</button>
                  <button type="button" aria-pressed={useParent} onClick={() => setTrendScope('parent')}>Parent topic</button>
                </div>
              )}
            </div>
            <LineChart
              points={d.trend.points}
              series={[{ name: 'Support notes', values, color: '#4A32B8' }]}
              unit={d.trend.unit}
              xUnit={d.trend.xUnit}
              periodHeader={d.trend.periodHeader}
              area
              ariaLabel={`${d.trend.unit} for ${trendName}, ${d.scope.span}. Exact values are in the data table below.`}
            />
          </section>

          <section className="card">
            <h2>Most typical notes</h2>
            <p className="card-caption">{d.sub ? d.sub.name : `All subtopics in ${t.name}`} · closest to the center of the topic · redacted</p>
            <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.typical.map((n) => (
                <li key={n.id}>
                  <button type="button" className="note-card" onClick={() => openNote(n.id, { version: d.scope.version })}>
                    <span style={{ display: 'block', fontSize: 14, lineHeight: 1.55 }}>“{n.excerpt}”</span>
                    <span className="small muted" style={{ display: 'block', marginTop: 6 }}>{n.id} · {n.date} · {n.subName}</span>
                  </button>
                </li>
              ))}
            </ul>
            <Link
              className="btn btn-primary"
              style={{ marginTop: 12, textDecoration: 'none' }}
              to={withQuery('/notes', search, { topic: t.id, sub: d.sub?.id ?? 'all', origin: d.sub?.id ?? 'all' })}
            >
              See all {num(d.scopeNotes)} notes
            </Link>
          </section>
        </div>
        <div className="side-col">
          <AiInsightsPanel scope={{ topicId: t.id, subId: subId ?? 'all', range: filters.range, version: filters.version, team: filters.team }} />
        </div>
      </div>

      {dialog === 'export' && (
        <ExportDialog
          topicId={t.id}
          subId={d.sub?.id ?? 'all'}
          scopeLabel={`${scopeLabel} · ${d.scope.span} · taxonomy ${d.scope.version}`}
          rows={d.scopeNotes}
          filters={filters}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'digest' && (
        <DigestDialog topicId={t.id} subId={d.sub?.id ?? 'all'} scopeLabel={scopeLabel} status={d.digest} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
