import { Link } from 'react-router-dom';
import type { CandidateSummary } from '@cti/shared';
import { num } from '../../lib/format';
import { EmptyState } from '../States';

const CHIP: Record<CandidateSummary['status'], string> = { review: 'chip-warm', draft: 'chip-violet', merged: 'chip-violet', dismissed: 'chip-neutral' };

export function CandidateGrid({ candidates, isEditor, search }: { candidates: CandidateSummary[]; isEditor: boolean; search: string }) {
  return (
    <section aria-labelledby="em-cands">
      <h2 id="em-cands" style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}>Candidate topics</h2>
      {candidates.length === 0 ? (
        <EmptyState title="No candidate topics">Run topic discovery to look for new topics in notes with no suitable topic.</EmptyState>
      ) : (
        <div className="grid3">
          {candidates.map((c) => (
            <article key={c.id} className="em-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <h3>{c.name}</h3>
                <span className={`chip ${CHIP[c.status]}`} style={{ flex: 'none' }}>{c.statusLabel}</span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>{num(c.notes)} notes · {c.range}</div>
              <div className="muted" style={{ fontSize: 13 }}>Suggested parent: {c.suggestedParentName}</div>
              <p>“{c.sample}”</p>
              <Link className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4, textDecoration: 'none' }}
                to={`/emerging/candidates/${c.id}${search}`} aria-label={`${c.status === 'review' ? (isEditor ? 'Review' : 'View') : 'View decision for'} ${c.name}`}>
                {c.status === 'review' ? (isEditor ? 'Review candidate' : 'View candidate') : 'View decision'}
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
