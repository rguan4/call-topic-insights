import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmergingResponse, RangeKey, TaskInfo } from '@cti/shared';
import { apiGet, apiSend } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { CandidateGrid } from '../components/emerging/CandidateGrid';
import { CandidateReview } from '../components/emerging/CandidateReview';
import { StatusCards } from '../components/emerging/StatusCards';
import { TasksCard } from '../components/emerging/TasksCard';
import { ErrorState, PageSkeleton } from '../components/States';
import { useToast } from '../components/Toast';
import { useFilters } from '../hooks/useFilters';
import { useMeta } from '../hooks/useMeta';
import '../styles/emerging.css';

const busy = (t: TaskInfo) => t.status === 'queued' || t.status === 'running';

/** Emerging topics: company-wide notes without a topic, background tasks and candidate review. */
export default function Emerging() {
  const { candidateId } = useParams();
  const { user } = useAuth();
  const isEditor = user?.role === 'editor';
  const { filters, update, search } = useFilters();
  const meta = useMeta().data;
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({
    queryKey: ['emerging', filters.range],
    queryFn: () => apiGet<EmergingResponse>('/emerging', { range: filters.range }),
    refetchInterval: (query) => (query.state.data?.tasks.some(busy) ? 800 : false)
  });

  // Announce tasks that finish while the page is open, and refresh counts that depend on them.
  const previous = useRef<Map<string, TaskInfo['status']>>(new Map());
  useEffect(() => {
    const tasks = q.data?.tasks;
    if (!tasks) return;
    for (const t of tasks) {
      const before = previous.current.get(t.id);
      if (before && (before === 'queued' || before === 'running')) {
        if (t.status === 'completed') {
          toast.show({ text: `${t.title}: ${t.meta}.` });
          qc.invalidateQueries({ queryKey: ['meta'] });
          qc.invalidateQueries({ queryKey: ['overview'] });
        } else if (t.status === 'failed') {
          toast.show({ text: `${t.title} failed${t.error ? ` (${t.error.code})` : ''}. Inspect the error to retry.` });
        }
      }
    }
    previous.current = new Map(tasks.map((t) => [t.id, t.status]));
  }, [q.data, qc, toast]);

  const run = useMutation({
    mutationFn: () => apiSend<TaskInfo>('POST', '/discovery/run'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emerging'] });
      toast.show({ text: 'Topic discovery started. Candidates appear here for review when it finishes.' });
    },
    onError: () => toast.show({ text: "Couldn't start topic discovery. Try again." })
  });
  const retry = useMutation({
    mutationFn: (id: string) => apiSend<TaskInfo>('POST', `/tasks/${id}/retry`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emerging'] }),
    onError: () => toast.show({ text: "Couldn't start the retry. Try again." })
  });

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 className="page-title">Emerging topics</h1>
          <p className="page-sub" style={{ maxWidth: 780, lineHeight: 1.5 }}>
            Company-wide · {q.data?.span ?? '…'}. Notes with no suitable topic are the input for discovery. Discovery only proposes candidates;
            the taxonomy changes only after a draft is reviewed and published.
          </p>
        </div>
        <div className="em-range">
          <label className="field">
            Date range
            <select className="select" value={filters.range} onChange={(e) => update({ range: e.target.value as RangeKey })}>
              {(meta?.ranges ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <span className="chip chip-neutral" style={{ marginBottom: 10 }}>Company-wide · all teams</span>
        </div>
      </div>
      {!isEditor && <div role="note" className="banner" style={{ background: '#EFEDF7' }}>View only. Editors run discovery and review candidates.</div>}

      {q.isPending && <PageSkeleton />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <StatusCards data={q.data} />
          {!candidateId && <TasksCard
            tasks={q.data.tasks}
            isEditor={isEditor}
            discoveryRunning={q.data.discoveryRunning}
            runPending={run.isPending}
            retryPending={retry.isPending}
            onRun={() => run.mutate()}
            onRetry={(id) => retry.mutate(id)}
          />}
          {candidateId ? (
            <CandidateReview id={candidateId} isEditor={isEditor} search={search} />
          ) : (
            <CandidateGrid candidates={q.data.candidates} isEditor={isEditor} search={search} />
          )}
        </>
      )}
    </>
  );
}
