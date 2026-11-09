import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { SearchResponse } from '@cti/shared';
import { apiGet } from '../api/client';
import { useNoteDrawer } from '../components/NoteDrawer';
import { EmptyState, ErrorState } from '../components/States';
import { withQuery } from '../components/notes/links';
import { useFilters } from '../hooks/useFilters';
import { num } from '../lib/format';
import '../styles/notes.css';

export default function Search() {
  const [params] = useSearchParams();
  const qText = (params.get('q') ?? '').trim();
  const { filters, search } = useFilters();
  const { openNote } = useNoteDrawer();

  const q = useQuery({
    queryKey: ['search', qText, filters],
    queryFn: () => apiGet<SearchResponse>('/search', { ...filters, q: qText }),
    enabled: !!qText,
    retry: false
  });
  const d = q.data;

  return (
    <>
      <div>
        <h1 className="page-title">{qText ? `Results for “${qText}”` : 'Search'}</h1>
        <p className="page-sub">
          Matched by meaning · {d ? `${d.scope.teamLabel} · ${d.scope.span} · taxonomy ${d.scope.version}` : `taxonomy ${filters.version}`}
        </p>
      </div>

      {!qText && <EmptyState title="Search topics and notes by meaning">Describe the client's problem, like “can't log in” or “wire to escrow”.</EmptyState>}

      {qText && q.isPending && (
        <div role="status" className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Searching topics and notes by meaning…</span>
          <div className="skeleton" style={{ height: 52 }} />
          <div className="skeleton" style={{ height: 52 }} />
        </div>
      )}

      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}

      {d && d.topics.length === 0 && (
        <EmptyState title="No topics or notes match by meaning">
          Describe the client's problem in other words, like “can't log in” or “wire to escrow”.
        </EmptyState>
      )}

      {d && d.topics.length > 0 && (
        <>
          <section aria-labelledby="sr-topics">
            <h2 id="sr-topics" style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>
              Topics <span className="muted" style={{ fontWeight: 400 }}>· {d.topics.length}</span>
            </h2>
            <div className="grid3">
              {d.topics.map((t) => (
                <Link key={t.id} className="result-card" to={withQuery(`/topics/${t.topicId}/${t.id}`, search, { q: null })}>
                  <span className="small muted">{t.parentName}</span>
                  <span style={{ fontSize: 16, fontWeight: 600 }}>{t.name}</span>
                  {t.locked ? (
                    <span style={{ fontSize: 13, color: '#8A4A16', fontWeight: 600 }}>Owned by {t.teamLabel} · outside your access</span>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>{num(t.notes ?? 0)} support notes · match {t.score?.toFixed(2)}</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
          <section aria-labelledby="sr-notes">
            <h2 id="sr-notes" style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>
              Notes <span className="muted" style={{ fontWeight: 400 }}>· top {d.notes.length} matches</span>
            </h2>
            {d.notes.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>No notes you can access match this search.</p>}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {d.notes.map((n) => (
                <li key={n.id}>
                  <button type="button" className="note-card" style={{ background: '#fff' }} onClick={() => openNote(n.id, { version: d.scope.version })}>
                    <span style={{ display: 'block', fontSize: 14, lineHeight: 1.55 }}>“{n.excerpt}”</span>
                    <span className="small muted" style={{ display: 'block', marginTop: 6 }}>
                      {n.id} · {n.date} · {n.subName} · match {n.score.toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {d.hiddenTopics > 0 && (
              <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
                Notes from {d.hiddenTopics} matching topic{d.hiddenTopics === 1 ? '' : 's'} outside your access aren't shown.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
