import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ErrorState, PageSkeleton } from '../components/States';
import { ReleaseCard, VersionHistory, VersionStrip } from '../components/labels/ReleaseStatus';
import { ReviewChanges } from '../components/labels/ReviewChanges';
import { TopicPanel } from '../components/labels/TopicPanel';
import { TopicTree } from '../components/labels/TopicTree';
import { useDrafts, useTree, useVersions } from '../components/labels/api';
import { useFilters } from '../hooks/useFilters';
import '../styles/labels.css';

/** /labels (topic tree + detail panel) and /labels/review (review changes before publishing). */
export default function Labels() {
  const { user } = useAuth();
  const { search } = useFilters();
  const location = useLocation();
  const isEditor = user?.role === 'editor';
  const reviewing = location.pathname.endsWith('/review');

  if (reviewing && !isEditor) return <Navigate to={`/labels${search}`} replace />;

  return (
    <div className="lb-page">
      {reviewing ? <ReviewChanges backHref={`/labels${search}`} /> : <LabelsHome isEditor={isEditor} search={search} />}
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function LabelsHome({ isEditor, search }: { isEditor: boolean; search: string }) {
  const { filters } = useFilters();
  const navigate = useNavigate();
  const versions = useVersions();
  const drafts = useDrafts();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const tree = useTree(filters.range, dq);
  const [selected, setSelected] = useState<string>('check-rollover');
  const reviewHref = `/labels/review${search}`;
  const count = drafts.data?.summary.total ?? 0;

  return (
    <>
      <div className="lb-row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 className="page-title">Label management</h1>
          <p className="page-sub">Topics describe the client's issue. Outcomes are tracked separately as handling status.</p>
        </div>
        {isEditor && (
          count > 0
            ? <Link to={reviewHref} className="btn btn-primary" style={{ textDecoration: 'none' }}>Review changes ({count})</Link>
            : <button type="button" className="btn btn-primary" disabled>Review changes (0)</button>
        )}
      </div>
      {!isEditor && <div role="note" className="banner" style={{ background: '#EFEDF7' }}>View only. Editors propose and publish taxonomy changes.</div>}

      {versions.isError && <ErrorState error={versions.error} onRetry={() => versions.refetch()} />}
      {versions.isPending && <div className="skeleton" style={{ height: 88 }} />}
      {versions.data && (
        <>
          <VersionStrip versions={versions.data} drafts={drafts.data} />
          <ReleaseCard versions={versions.data} isEditor={isEditor} />
        </>
      )}

      {tree.isError ? (
        <ErrorState error={tree.error} onRetry={() => tree.refetch()} />
      ) : (
        <div className="lb-columns">
          <TopicTree
            tree={tree.data}
            loading={tree.isPending}
            refreshing={tree.isFetching && tree.isPlaceholderData}
            q={q}
            onQ={setQ}
            selected={selected}
            onSelect={setSelected}
            onSelectCandidate={(id) => navigate(`/emerging/candidates/${id}${search}`)}
          />
          <aside className="lb-side" aria-label="Selected topic and versions">
            <TopicPanel id={selected} range={filters.range} isEditor={isEditor} reviewHref={reviewHref} />
            {versions.data ? <VersionHistory versions={versions.data} /> : versions.isPending ? <PageSkeleton /> : null}
          </aside>
        </div>
      )}
    </>
  );
}
