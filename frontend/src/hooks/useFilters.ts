import { useSearchParams } from 'react-router-dom';
import type { Filters, RangeKey, TeamScope } from '@cti/shared';
import { useAuth } from '../auth/AuthContext';
import { useMeta } from './useMeta';

const RANGE_KEYS: RangeKey[] = ['7d', '30d', '90d'];

/**
 * Date range, taxonomy version and team live in the URL (?range=&version=&team=),
 * so they survive navigation, reloads and shared links. Defaults are left out of the URL.
 */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const meta = useMeta().data;
  const fixedTeam = user && user.access !== 'all' ? user.access[0] : null;

  const defaults: Filters = {
    range: '30d',
    version: meta?.activeVersion ?? 'v7',
    team: fixedTeam ?? 'all'
  };

  const rawRange = params.get('range') as RangeKey | null;
  const filters: Filters = {
    range: rawRange && RANGE_KEYS.includes(rawRange) ? rawRange : defaults.range,
    version: params.get('version') ?? defaults.version,
    team: fixedTeam ?? ((params.get('team') as TeamScope | null) ?? defaults.team)
  };

  const toParams = (f: Filters, base: URLSearchParams) => {
    const next = new URLSearchParams(base);
    (['range', 'version', 'team'] as const).forEach((k) => {
      if (f[k] === defaults[k]) next.delete(k);
      else next.set(k, f[k]);
    });
    return next;
  };

  const update = (patch: Partial<Filters>) => setParams(toParams({ ...filters, ...patch }, params));
  const reset = () => setParams(toParams(defaults, params));
  const isDefault = filters.range === defaults.range && filters.version === defaults.version && filters.team === defaults.team;
  const qs = toParams(filters, new URLSearchParams()).toString();

  return {
    filters,
    defaults,
    update,
    reset,
    isDefault,
    teamFixed: !!fixedTeam,
    /** "?range=7d" etc. Append to links so filters carry over. */
    search: qs ? `?${qs}` : ''
  };
}
