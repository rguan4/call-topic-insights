import type { Filters, RangeKey, ScopeInfo, TeamScope, User } from '@cti/shared';
import { RANGES, SYNCED_AT, span } from './data/dates';
import { TEAMS } from './data/catalog';
import { state } from './data/state';
import { canRead } from './auth';
import { HttpError } from './errors';

export function selectableVersions() {
  return state.versions.filter((v) => v.status === 'active' || v.status === 'previous');
}

/** Read and validate ?range=&version=&team= for the signed-in user. */
export function parseFilters(query: Record<string, unknown>, user: User): Filters {
  const range = (query.range ?? '30d') as RangeKey;
  if (!(range in RANGES)) throw new HttpError(400, 'invalid_range', `Unknown date range "${String(range)}".`);

  const version = String(query.version ?? state.activeVersion);
  if (!selectableVersions().some((v) => v.id === version)) throw new HttpError(400, 'invalid_version', `Taxonomy version "${version}" isn't available.`);

  const defaultTeam: TeamScope = user.access === 'all' ? 'all' : user.access[0];
  const team = String(query.team ?? defaultTeam) as TeamScope;
  if (team !== 'all' && !(team in TEAMS)) throw new HttpError(400, 'invalid_team', `Unknown team "${team}".`);
  if (team === 'all' ? user.access !== 'all' : !canRead(user, team)) {
    throw new HttpError(403, 'forbidden_team', "You don't have access to this team's data.");
  }
  return { range, version, team };
}

export function scopeInfo(f: Filters): ScopeInfo {
  const days = RANGES[f.range].days;
  return {
    range: f.range,
    rangeLabel: RANGES[f.range].label,
    span: span(days - 1, 0),
    prevSpan: span(2 * days - 1, days),
    version: f.version,
    team: f.team,
    teamLabel: f.team === 'all' ? 'All teams' : TEAMS[f.team],
    syncedAt: SYNCED_AT
  };
}
