import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { TopicSort, TopicsResponse } from '@cti/shared';
import { apiGet } from '../api/client';
import { FilterBar } from '../components/FilterBar';
import { EmptyState, ErrorState, PageSkeleton } from '../components/States';
import { withQuery } from '../components/notes/links';
import { useFilters } from '../hooks/useFilters';
import { changeText, num, pctText } from '../lib/format';
import '../styles/notes.css';

export default function Topics() {
  const { filters, search } = useFilters();
  const navigate = useNavigate();
  const location = useLocation();
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<TopicSort>('notes');

  const query = useQuery({
    queryKey: ['topics', filters, q, sort],
    queryFn: () => apiGet<TopicsResponse>('/topics', { ...filters, q, sort }),
    placeholderData: keepPreviousData
  });
  const d = query.data;
  const refreshing = query.isFetching && query.isPlaceholderData;

  return (
    <>
      {notice && (
        <div role="status" className="banner">
          <span style={{ flex: 1 }}>{notice}</span>
          <button
            type="button"
            className="icon-btn"
            style={{ width: 30, height: 30, background: '#fff', color: '#4A32B8', fontSize: 16 }}
            aria-label="Dismiss message"
            onClick={() => navigate(location.pathname + location.search, { replace: true, state: null })}
          >
            ×
          </button>
        </div>
      )}
      <FilterBar scopeSpan={d?.scope.span} prevSpan={d?.scope.prevSpan} />
      <div>
        <h1 className="page-title">Topics</h1>
        <p className="page-sub">{d ? `${d.scope.teamLabel} · ${d.scope.span} · taxonomy ${d.scope.version}` : ' '}</p>
      </div>
      <div className="toolbar">
        <label className="field" style={{ flex: '1 1 260px', maxWidth: 380 }}>
          Search topics
          <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Topic or subtopic name" />
        </label>
        <label className="field">
          Sort by
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as TopicSort)}>
            <option value="notes">Most support notes</option>
            <option value="change">Biggest increase</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        {d && (
          <span role="status" className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
            {d.topics.length} of {d.totalTopics} topics{d.scope.team === 'all' ? ' shown in detail' : ''}
          </span>
        )}
      </div>

      {query.isPending && <PageSkeleton />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {d && d.topics.length === 0 && (
        <EmptyState
          title={`No topics match “${q}”`}
          action={<button type="button" className="btn btn-secondary" onClick={() => setQ('')}>Clear search</button>}
        >
          Check the spelling or try a broader word. Only topics in {d.scope.teamLabel} are listed.
        </EmptyState>
      )}
      {d && d.topics.length > 0 && (
        <div className={`table-wrap${refreshing ? ' refreshing' : ''}`} style={{ maxHeight: 640 }} aria-busy={refreshing}>
          <table className="table" style={{ minWidth: 760 }}>
            <caption className="sr-only">Topics in the current scope</caption>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col">Owner team</th>
                <th scope="col" style={{ textAlign: 'right' }}>Subtopics</th>
                <th scope="col" style={{ textAlign: 'right' }}>Support notes</th>
                <th scope="col" style={{ textAlign: 'right' }}>Share of {num(d.scopeNotes)} notes</th>
                <th scope="col" style={{ textAlign: 'right' }}>Change vs prior period</th>
              </tr>
            </thead>
            <tbody>
              {d.topics.map((t) => {
                const to = withQuery(`/topics/${t.id}/${t.largestSubId}`, search);
                const names = t.subtopicNames;
                return (
                  <tr key={t.id} className="clickable" onClick={() => navigate(to)}>
                    <td>
                      <Link to={to} style={{ fontWeight: 600, color: '#4A32B8', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
                        {t.name}
                      </Link>
                      <div className="sub-preview">
                        {names.slice(0, 3).join(' · ')}
                        {names.length > 3 ? ` · +${names.length - 3} more` : ''}
                      </div>
                    </td>
                    <td className="muted">{t.teamLabel}</td>
                    <td style={{ textAlign: 'right' }}>{t.subtopicCount}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{num(t.notes)}</td>
                    <td className="muted" style={{ textAlign: 'right' }}>{pctText(t.sharePct)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className={`chip ${t.changePct > 0 ? 'chip-warm' : 'chip-violet'}`}>{changeText(t.changePct)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
