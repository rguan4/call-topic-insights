import type { RangeKey, TeamScope } from '@cti/shared';
import { useFilters } from '../hooks/useFilters';
import { useMeta } from '../hooks/useMeta';

/** Shared filter bar for Overview, Topics and Support notes. */
export function FilterBar({ scopeSpan, prevSpan }: { scopeSpan?: string; prevSpan?: string }) {
  const { filters, update, reset, isDefault, teamFixed } = useFilters();
  const meta = useMeta().data;
  const teamLabel = filters.team === 'all' ? 'All teams' : meta?.teams.find((t) => t.id === filters.team)?.label ?? filters.team;

  return (
    <section aria-label="Filters" className="filterbar">
      <label className="field">
        Date range
        <select className="select" value={filters.range} onChange={(e) => update({ range: e.target.value as RangeKey })}>
          {(meta?.ranges ?? []).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <label className="field">
        Taxonomy version
        <select className="select" value={filters.version} onChange={(e) => update({ version: e.target.value })}>
          {(meta?.selectableVersions ?? []).map((v) => (
            <option key={v.id} value={v.id}>{v.id}{v.status === 'active' ? ' (active)' : ''}</option>
          ))}
        </select>
      </label>
      {teamFixed ? (
        <div className="field">
          Team
          <span className="static-field">{teamLabel} <span className="small muted">· your access</span></span>
        </div>
      ) : (
        <label className="field">
          Team
          <select className="select" value={filters.team} onChange={(e) => update({ team: e.target.value as TeamScope })}>
            <option value="all">All teams</option>
            {(meta?.teams ?? []).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      )}
      <button type="button" className="btn btn-secondary btn-sm" style={{ borderRadius: 10, height: 38 }} onClick={reset} disabled={isDefault}>
        Reset filters
      </button>
      <div className="scope-meta">
        <div><strong>{teamLabel} · {scopeSpan ?? '…'} · taxonomy {filters.version}</strong></div>
        <div>Compared with {prevSpan ?? '…'} · Unit: support notes · Synced {meta?.syncedAt ?? '…'}</div>
      </div>
    </section>
  );
}
