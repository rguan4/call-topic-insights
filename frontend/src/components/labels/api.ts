import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CompareResponse, DraftChange, DraftChangeRequest, DraftsResponse, PublishRequest, RangeKey, ReleaseInfo,
  TaxonomyTopicDetail, TaxonomyTreeResponse, VersionsResponse
} from '@cti/shared';
import { apiGet, apiSend } from '../../api/client';

export function useTree(range: RangeKey, q: string) {
  return useQuery({
    queryKey: ['taxonomy', 'tree', range, q],
    queryFn: () => apiGet<TaxonomyTreeResponse>('/taxonomy/tree', { range, q }),
    placeholderData: keepPreviousData
  });
}

export function useTopicDetail(id: string | null, range: RangeKey) {
  return useQuery({
    queryKey: ['taxonomy', 'topic', id, range],
    queryFn: () => apiGet<TaxonomyTopicDetail>(`/taxonomy/topics/${id}`, { range }),
    enabled: !!id
  });
}

export function useCompare(a: string | null, b: string | null, range: RangeKey) {
  return useQuery({
    queryKey: ['taxonomy', 'compare', a, b, range],
    queryFn: () => apiGet<CompareResponse>('/taxonomy/compare', { a, b, range }),
    enabled: !!a && !!b && a !== b
  });
}

export function useDrafts() {
  return useQuery({ queryKey: ['drafts'], queryFn: () => apiGet<DraftsResponse>('/drafts') });
}

export function useVersions() {
  return useQuery({
    queryKey: ['versions'],
    queryFn: () => apiGet<VersionsResponse>('/versions'),
    // Poll while a release is being prepared.
    refetchInterval: (q) => (q.state.data?.release?.state === 'preparing' ? 1000 : false)
  });
}

/** Everything that depends on the draft or the active version. */
function useInvalidateLabels() {
  const qc = useQueryClient();
  return () => {
    for (const key of [['taxonomy'], ['drafts'], ['versions'], ['meta'], ['overview']]) qc.invalidateQueries({ queryKey: key });
  };
}

export function useCreateDraft() {
  const invalidate = useInvalidateLabels();
  return useMutation({
    mutationFn: (body: DraftChangeRequest) => apiSend<DraftChange>('POST', '/drafts', body),
    onSuccess: invalidate
  });
}

export function useUpdateReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiSend<DraftChange>('PATCH', `/drafts/${id}`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drafts'] })
  });
}

export function useDeleteDraft() {
  const invalidate = useInvalidateLabels();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend<void>('DELETE', `/drafts/${id}`),
    onSuccess: () => {
      invalidate();
      // A removed candidate change sends the candidate back to review.
      qc.invalidateQueries({ queryKey: ['emerging'] });
    }
  });
}

export function usePublish() {
  const invalidate = useInvalidateLabels();
  return useMutation({
    mutationFn: (body: PublishRequest) => apiSend<ReleaseInfo>('POST', '/versions/publish', body),
    onSuccess: invalidate
  });
}

export function useActivate() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLabels();
  return useMutation({
    mutationFn: (id: string) => apiSend<ReleaseInfo>('POST', `/versions/${id}/activate`),
    onSuccess: () => {
      invalidate();
      // Names in every page can change with the new active version.
      qc.invalidateQueries();
    }
  });
}

export function useRetryPreparation() {
  const invalidate = useInvalidateLabels();
  return useMutation({
    mutationFn: (id: string) => apiSend<ReleaseInfo>('POST', `/versions/${id}/retry-preparation`),
    onSuccess: invalidate
  });
}

export function chipFor(kind: string): string {
  switch (kind) {
    case 'renamed':
    case 'moved':
    case 'merging':
    case 'new':
      return 'chip-violet';
    case 'looksAlike':
      return 'chip-warm';
    default:
      return 'chip-neutral';
  }
}
