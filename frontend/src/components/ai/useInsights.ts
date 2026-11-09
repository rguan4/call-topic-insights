import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InsightResult, InsightScope } from '@cti/shared';
import { ApiRequestError, apiGet, apiSend } from '../../api/client';
import type { AiScope } from './AiInsightsPanel';

export const sameScope = (a: Pick<AiScope, 'topicId' | 'subId' | 'range' | 'version'>, b: Pick<AiScope, 'topicId' | 'subId' | 'range' | 'version'>) =>
  a.topicId === b.topicId && a.subId === b.subId && a.range === b.range && a.version === b.version;

/**
 * Loads the latest insight for a topic + subtopic, starts new jobs and polls them.
 * While a regeneration runs, the previous completed result stays available.
 */
export function useInsights(scope: AiScope) {
  const qc = useQueryClient();
  const topicKey = `${scope.topicId}|${scope.subId}`;
  const [active, setActive] = useState<{ id: string; key: string; previous: InsightResult | null } | null>(null);

  // A job belongs to one topic + subtopic; switching topics hides it.
  useEffect(() => {
    if (active && active.key !== topicKey) setActive(null);
  }, [topicKey, active]);

  const preview = useQuery({
    queryKey: ['insight-scope', scope],
    queryFn: () => apiGet<InsightScope>('/insights/scope', scope),
    staleTime: 60_000
  });

  const latest = useQuery({
    queryKey: ['insight-latest', scope.topicId, scope.subId],
    queryFn: async () => {
      try {
        return await apiGet<InsightResult>('/insights/latest', { topicId: scope.topicId, subId: scope.subId });
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 404) return null;
        throw e;
      }
    },
    retry: false
  });

  const activeId = active && active.key === topicKey ? active.id : null;
  const job = useQuery({
    queryKey: ['insight', activeId],
    queryFn: () => apiGet<InsightResult>(`/insights/${activeId}`),
    enabled: !!activeId,
    refetchInterval: (q) => (q.state.data?.status === 'running' || !q.state.data ? 700 : false)
  });

  useEffect(() => {
    if (job.data && job.data.status !== 'running') {
      qc.setQueryData(['insight-latest', scope.topicId, scope.subId], job.data);
    }
  }, [job.data, qc, scope.topicId, scope.subId]);

  const start = useMutation({
    mutationFn: () => apiSend<InsightResult>('POST', '/insights', scope),
    onSuccess: (r, _v, ctx) => {
      qc.setQueryData(['insight', r.id], r);
      setActive({ id: r.id, key: topicKey, previous: (ctx as { previous: InsightResult | null } | undefined)?.previous ?? null });
    },
    onMutate: () => {
      const cur = (job.data ?? latest.data) || null;
      // Keep the old result on screen only when regenerating the same scope.
      return { previous: cur && cur.status === 'completed' && sameScope(cur.scope, scope) ? cur : null };
    }
  });

  const update = (r: InsightResult) => {
    qc.setQueryData(['insight', r.id], r);
    qc.setQueryData(['insight-latest', scope.topicId, scope.subId], r);
  };

  const helpful = useMutation({
    mutationFn: (v: { id: string; helpful: boolean }) => apiSend<InsightResult>('POST', `/insights/${v.id}/feedback`, { helpful: v.helpful }),
    onSuccess: update
  });

  const report = useMutation({
    mutationFn: (v: { id: string; reason: string; details: string }) =>
      apiSend<{ ref: string; result: InsightResult }>('POST', `/insights/${v.id}/reports`, { reason: v.reason, details: v.details }),
    onSuccess: (r) => update(r.result)
  });

  const current: InsightResult | null = (activeId ? job.data : null) ?? latest.data ?? null;
  return {
    preview,
    latest,
    current,
    previous: active && active.key === topicKey ? active.previous : null,
    starting: start.isPending,
    startError: start.error,
    generate: () => start.mutate(),
    helpful,
    report
  };
}
