import { useEffect, useState } from 'react';
import type { TaxonomyTreeResponse } from '@cti/shared';
import { num } from '../../lib/format';
import { chipFor } from './api';

interface Props {
  tree: TaxonomyTreeResponse | undefined;
  loading: boolean;
  refreshing: boolean;
  q: string;
  onQ: (q: string) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  onSelectCandidate: (candidateId: string) => void;
}

const DEFAULT_OPEN = ['wires', 'check', 'ira', 'invest'];

/** Topic tree with search, expand/collapse and selectable rows. */
export function TopicTree({ tree, loading, refreshing, q, onQ, selected, onSelect, onSelectCandidate }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(DEFAULT_OPEN.map((id) => [id, true])));
  const searching = q.trim().length > 0;

  // Make sure the selected subtopic's parent is open.
  useEffect(() => {
    if (!tree || !selected) return;
    const parent = tree.parents.find((p) => p.subtopics.some((s) => s.id === selected));
    if (parent && !open[parent.id]) setOpen((o) => ({ ...o, [parent.id]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tree]);

  return (
    <section aria-labelledby="lb-tree-title" className="card lb-tree">
      <div className="lb-row-between" style={{ alignItems: 'flex-end' }}>
        <div>
          <h2 id="lb-tree-title">Topic tree · {tree?.version ?? '…'}</h2>
          <p className="card-caption">{tree ? `${tree.notesLabel}. Draft changes are marked.` : 'Loading…'}</p>
        </div>
        <div className="lb-tree-tools">
          <label className="field">
            Search
            <input type="search" className="input" style={{ width: 180, height: 36 }} value={q} onChange={(e) => onQ(e.target.value)} placeholder="Topic name" />
          </label>
          <button type="button" className="btn btn-secondary btn-sm lb-tool-btn" onClick={() => setOpen(Object.fromEntries((tree?.parents ?? []).map((p) => [p.id, true])))}>Expand all</button>
          <button type="button" className="btn btn-secondary btn-sm lb-tool-btn" onClick={() => setOpen({})}>Collapse all</button>
        </div>
      </div>
      <span role="status" className="sr-only">{searching && tree ? `${tree.matchCount} matching topics` : ''}</span>

      {loading && <div className="skeleton" style={{ height: 360, marginTop: 12 }} />}
      {tree && tree.parents.length === 0 && <p className="muted" style={{ margin: '16px 0 4px', fontSize: 14 }}>No topics match “{q}”.</p>}

      {tree && tree.parents.length > 0 && (
        <div className={`lb-tree-scroll${refreshing ? ' refreshing' : ''}`}>
          <table className="table">
            <caption className="sr-only">Topics and subtopics with note counts and draft status</caption>
            <thead>
              <tr>
                <th scope="col">Topic</th>
                <th scope="col" style={{ textAlign: 'right' }}>Notes</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {tree.parents.map((p) => {
                const isOpen = searching || !!open[p.id];
                return (
                  <ParentRows
                    key={p.id}
                    parent={p}
                    isOpen={isOpen}
                    onToggle={() => setOpen({ ...open, [p.id]: !open[p.id] })}
                    toggleDisabled={searching}
                    selected={selected}
                    onSelect={onSelect}
                    onSelectCandidate={onSelectCandidate}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ParentRows({ parent: p, isOpen, onToggle, toggleDisabled, selected, onSelect, onSelectCandidate }: {
  parent: TaxonomyTreeResponse['parents'][number];
  isOpen: boolean;
  onToggle: () => void;
  toggleDisabled: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onSelectCandidate: (candidateId: string) => void;
}) {
  return (
    <>
      <tr className={selected === p.id ? 'selected' : undefined}>
        <td>
          <div className="lb-name-cell">
            <button
              type="button"
              className="lb-caret"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${p.name}`}
              onClick={onToggle}
              disabled={toggleDisabled}
            >
              {isOpen ? '▾' : '▸'}
            </button>
            <button type="button" className="lb-name-btn parent" aria-pressed={selected === p.id} onClick={() => onSelect(p.id)}>
              {p.name}
            </button>
          </div>
          {p.note && <div className="small muted lb-note">{p.note}</div>}
        </td>
        <td style={{ textAlign: 'right' }}>{num(p.notes)}</td>
        <td><span className={`chip ${chipFor(p.statusKind)}`}>{p.status}</span></td>
      </tr>
      {isOpen && p.subtopics.map((s) => {
        const isSel = selected === s.id;
        return (
          <tr key={s.id} className={isSel ? 'selected' : s.statusKind === 'looksAlike' ? 'lb-warn-row' : s.draftOnly ? 'lb-new-row' : undefined}>
            <td style={{ paddingLeft: 44 }}>
              <button
                type="button"
                className="lb-name-btn"
                aria-pressed={s.draftOnly ? undefined : isSel}
                onClick={() => (s.candidateId ? onSelectCandidate(s.candidateId) : onSelect(s.id))}
                title={s.candidateId ? 'Open this candidate in Emerging topics' : undefined}
              >
                {s.name}
              </button>
              {s.note && <div className="small muted lb-note">{s.note}</div>}
            </td>
            <td style={{ textAlign: 'right' }}>{num(s.notes)}</td>
            <td><span className={`chip ${chipFor(s.statusKind)}`}>{s.status}</span></td>
          </tr>
        );
      })}
    </>
  );
}
