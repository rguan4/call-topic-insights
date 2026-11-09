import { useEffect, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { NotesResponse } from '@cti/shared';
import { ApiRequestError, apiGet } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { FilterBar } from '../components/FilterBar';
import { useNoteDrawer } from '../components/NoteDrawer';
import { EmptyState, ErrorState } from '../components/States';
import { NoAccess } from '../components/notes/NoAccess';
import { statusChip, withQuery } from '../components/notes/links';
import { useFilters } from '../hooks/useFilters';
import { useMeta } from '../hooks/useMeta';
import { num } from '../lib/format';
import '../styles/notes.css';

/**
 * /notes query params (besides range/version/team):
 *  topic   topic ID (defaults to the user's first readable topic)
 *  sub     subtopic ID or 'all'
 *  origin  subtopic ('all' = topic) the user came from; drives the back link
 *  date    date bucket index, status, q (text or note ID), sort, page, per
 *  insight + issue  AI finding (from AI Topic Insights "View all supporting notes")
 */
const LIST_KEYS = ['date', 'status', 'q', 'insight', 'issue'] as const;

export default function Notes() {
  const [params, setParams] = useSearchParams();
  const { filters, search } = useFilters();
  const { user } = useAuth();
  const meta = useMeta().data;
  const { openNote, openId } = useNoteDrawer();

  const defaultTopic = meta?.subtopics.find((s) => user?.access === 'all' || (user && user.access.includes(s.team)))?.parentId ?? 'wires';
  const topic = params.get('topic') ?? defaultTopic;
  const sub = params.get('sub') ?? 'all';
  const origin = params.get('origin') ?? sub;
  const date = params.get('date') ?? 'all';
  const status = params.get('status') ?? 'all';
  const qParam = params.get('q') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const page = Number(params.get('page') ?? 1);
  const per = Number(params.get('per') ?? 10);
  const insight = params.get('insight') ?? undefined;
  const issue = params.get('issue') ?? undefined;

  // Search box: local text, written to the URL after a short pause.
  const [text, setText] = useState(qParam);
  useEffect(() => setText(qParam), [qParam]);
  useEffect(() => {
    if (text === qParam) return;
    const id = setTimeout(() => set({ q: text }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const set = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || (k === 'date' && v === 'all') || (k === 'status' && v === 'all') || (k === 'sort' && v === 'newest') || (k === 'per' && v === '10')) next.delete(k);
      else next.set(k, v);
    }
    if (!keepPage) next.delete('page');
    setParams(next);
  };

  const q = useQuery({
    queryKey: ['notes', filters, topic, sub, date, status, qParam, sort, page, per, insight, issue],
    queryFn: () => apiGet<NotesResponse>('/notes', { ...filters, topic, sub, date, status, q: qParam, sort, page, per, insight, issue }),
    placeholderData: keepPreviousData,
    retry: (count, err) => !(err instanceof ApiRequestError && err.status < 500) && count < 1
  });

  const listRef = useRef<HTMLDivElement>(null);
  const goPage = (p: number) => {
    set({ page: String(p) }, true);
    listRef.current?.scrollTo({ top: 0 });
  };

  if (q.isError && q.error instanceof ApiRequestError && q.error.status === 403) {
    const tm = meta?.subtopics.find((s) => s.parentId === topic);
    return <NoAccess topicName={tm?.parentName ?? topic} teamName={meta?.teams.find((t) => t.id === tm?.team)?.label ?? 'another team'} />;
  }

  const d = q.data;
  const originName = d ? (origin === 'all' ? d.topic.name : d.subOptions.find((s) => s.id === origin)?.name ?? d.topic.name) : '…';
  const backUrl = withQuery(`/topics/${topic}${origin !== 'all' ? `/${origin}` : ''}`, search);
  const refreshing = q.isFetching && q.isPlaceholderData;
  const hasListFilters = date !== 'all' || status !== 'all' || !!qParam || !!insight;
  const statusLabel: Record<string, string> = { Classified: 'Classified', 'Low confidence': 'Low confidence', Reported: 'Reported as incorrect' };

  return (
    <>
      <Link className="back-link" to={backUrl}>← Back to {originName}</Link>
      <FilterBar scopeSpan={d?.scope.span} prevSpan={d?.scope.prevSpan} />
      <div>
        <h1 className="page-title">Support notes</h1>
        <p className="page-sub">{d ? `${d.topic.name} · ${d.scope.span} · taxonomy ${d.scope.version} · ${d.scope.teamLabel}` : ' '}</p>
      </div>

      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      {!q.isError && (
        <>
          <section aria-label="Note filters" className="toolbar">
            <label className="field" style={{ flex: '1 1 220px', maxWidth: 300 }}>
              Search in notes
              <input className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Words or note ID" />
            </label>
            <label className="field">
              Topic
              <select className="select" value={sub} onChange={(e) => set({ sub: e.target.value, insight: null, issue: null, origin })}>
                <option value="all">All of {d?.topic.name ?? '…'} {d ? `(${num(d.topicNotes)})` : ''}</option>
                {(d?.subOptions ?? []).map((o) => <option key={o.id} value={o.id}>{o.name} ({num(o.notes)})</option>)}
              </select>
            </label>
            <label className="field">
              Date
              <select className="select" value={date} onChange={(e) => set({ date: e.target.value })}>
                <option value="all">All of {d?.scope.span ?? '…'}</option>
                {(d?.dateOptions ?? []).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
            <label className="field">
              Classification
              <select className="select" value={status} onChange={(e) => set({ status: e.target.value })}>
                <option value="all">All statuses</option>
                <option value="Classified">Classified</option>
                <option value="Low confidence">Low confidence</option>
                <option value="Reported">Reported as incorrect</option>
              </select>
            </label>
            <label className="field">
              Sort
              <select className="select" value={sort} onChange={(e) => set({ sort: e.target.value })}>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="typical">Most typical first</option>
              </select>
            </label>
            <label className="field">
              Per page
              <select className="select" value={String(per)} onChange={(e) => set({ per: e.target.value })}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
          </section>

          <div role="status" aria-live="polite" className="summary-bar">
            <strong style={{ marginRight: 4 }}>
              {d ? (d.total ? `Showing ${num((d.page - 1) * d.per + 1)}–${num(Math.min(d.page * d.per, d.total))} of ${num(d.total)} support notes` : 'No support notes') : 'Loading…'}
            </strong>
            {d && (
              <>
                <span className="filter-chip">Topic: {d.sub ? d.sub.name : `All of ${d.topic.name}`}</span>
                {d.finding && (
                  <span className="filter-chip">
                    AI finding: {d.finding.title} ({num(d.finding.count)} sampled notes)
                    <button type="button" aria-label="Remove AI finding filter" onClick={() => set({ insight: null, issue: null })}>×</button>
                  </span>
                )}
                <span className="filter-chip">
                  Date: {date === 'all' ? d.scope.span : d.dateOptions.find((o) => o.id === date)?.label}
                  {date !== 'all' && <button type="button" aria-label="Remove date filter" onClick={() => set({ date: 'all' })}>×</button>}
                </span>
                {status !== 'all' && (
                  <span className="filter-chip">
                    Status: {statusLabel[status] ?? status}
                    <button type="button" aria-label="Remove status filter" onClick={() => set({ status: 'all' })}>×</button>
                  </span>
                )}
                {qParam && (
                  <span className="filter-chip">
                    Search: “{qParam}”
                    <button type="button" aria-label="Clear note search" onClick={() => { setText(''); set({ q: null }); }}>×</button>
                  </span>
                )}
                <span className="filter-chip">Taxonomy {d.scope.version}</span>
                <span className="filter-chip">Team: {d.scope.teamLabel}</span>
              </>
            )}
            {hasListFilters && (
              <button type="button" className="link-btn" onClick={() => { setText(''); set(Object.fromEntries(LIST_KEYS.map((k) => [k, null]))); }}>
                Clear note filters
              </button>
            )}
          </div>

          {q.isPending && (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="sr-only">Loading notes</span>
              {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
            </div>
          )}

          {d && d.total === 0 && (
            <EmptyState
              title="No notes match these filters"
              action={<button type="button" className="btn btn-primary" onClick={() => { setText(''); set(Object.fromEntries(LIST_KEYS.map((k) => [k, null]))); }}>Clear note filters</button>}
            >
              Try another date, status or search term, or clear the note filters.
            </EmptyState>
          )}

          {d && d.total > 0 && (
            <>
              <div ref={listRef} className={`table-wrap${refreshing ? ' refreshing' : ''}`} style={{ maxHeight: 620 }} aria-busy={refreshing}>
                <table className="table" style={{ minWidth: 820 }}>
                  <caption className="sr-only">Support notes matching the active filters</caption>
                  <thead>
                    <tr>
                      <th scope="col">Note ID</th>
                      <th scope="col">Date</th>
                      <th scope="col">Topic</th>
                      <th scope="col">Classification</th>
                      <th scope="col">Redacted excerpt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.id} className={`clickable${openId === r.id ? ' selected' : ''}`} onClick={() => openNote(r.id, { version: d.scope.version })}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="id-btn" onClick={(e) => { e.stopPropagation(); openNote(r.id, { version: d.scope.version }); }}>{r.id}</button>
                        </td>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                        <td>{r.subName}</td>
                        <td style={{ whiteSpace: 'nowrap' }}><span className={`chip ${statusChip(r.status)}`}>{r.status}</span></td>
                        <td style={{ color: '#3A3452', lineHeight: 1.5 }}>{r.excerpt.length > 120 ? `${r.excerpt.slice(0, 117)}…` : r.excerpt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={d.page} pages={d.pages} onGo={goPage} />
            </>
          )}
        </>
      )}
    </>
  );
}

function Pager({ page, pages, onGo }: { page: number; pages: number; onGo: (p: number) => void }) {
  const nums: number[] = [];
  for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
  return (
    <nav aria-label="Pagination" className="pager">
      <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pages}</span>
      <div className="pages">
        <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onGo(page - 1)}>Previous</button>
        {nums.map((p, k) => (
          <span key={p} style={{ display: 'contents' }}>
            {k > 0 && p - nums[k - 1] > 1 && <span aria-hidden="true" className="muted" style={{ padding: '0 4px' }}>…</span>}
            <button type="button" className="page-btn" aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined} onClick={() => onGo(p)}>{p}</button>
          </span>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onGo(page + 1)}>Next</button>
      </div>
    </nav>
  );
}
