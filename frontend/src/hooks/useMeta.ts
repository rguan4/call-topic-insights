import { useQuery } from '@tanstack/react-query';
import type { MetaResponse } from '@cti/shared';
import { apiGet } from '../api/client';

export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => apiGet<MetaResponse>('/meta'), staleTime: 60_000 });
}
