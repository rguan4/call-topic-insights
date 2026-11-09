import { useState } from 'react';
import type { DraftsResponse, VersionsResponse } from '@cti/shared';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { useActivate, useRetryPreparation } from './api';

const STATE_LABEL: Record<string, string> = {
  preparing: 'Preparing',
  ready: 'Ready to activate',
  active: 'Active',
  failed: 'Failed',
  previous: 'Previous',
  draft: 'Draft'
};

function stateChip(state: string): string {
  if (state === 'active') return 'chip-solid';
  if (state === 'failed') return 'chip-failed';
  if (state === 'preparing' || state === 'ready') return 'chip-warm';
  return 'chip-neutral';
}

/** Cards for the active version, the release in progress and the draft. */
export function VersionStrip({ versions, drafts }: { versions: VersionsResponse; drafts: DraftsResponse | undefined }) {
  const active = versions.versions.find((v) => v.id === versions.activeVersion);
  const release = versions.release;
  const releaseOpen = release && release.state !== 'active';
  const n = drafts?.summary.total ?? versions.draftCount;
  return (
    <section aria-label="Version status" className="lb-strip">
      <div className="lb-strip-card">
        <div className="lb-strip-head"><span>{versions.activeVersion}</span><span className="chip chip-solid">Active</span></div>
        <div className="small muted">
          Published {active?.publishedAt ?? '—'} · classifying new notes
        </div>
      </div>
      {releaseOpen && release && (
        <div className={`lb-strip-card${release.state === 'failed' ? ' failed' : ''}`}>
          <div className="lb-strip-head"><span>{release.id}</span><span className={`chip ${stateChip(release.state)}`}>{STATE_LABEL[release.state]}</span></div>
          <div className="small muted">Published {release.publishedAt} · {release.changeCount} changes</div>
        </div>
      )}
      <div className="lb-strip-card dashed">
        <div className="lb-strip-head"><span>{releaseOpen ? 'Next draft' : `Draft ${nextId(versions)}`}</span><span className="chip chip-neutral">Draft</span></div>
        <div className="small muted">{n ? `${n} change${n === 1 ? '' : 's'} · not published` : 'No changes yet'}</div>
      </div>
    </section>
  );
}

function nextId(v: VersionsResponse): string {
  const max = Math.max(...v.versions.map((x) => Number(x.id.replace(/\D/g, '')) || 0));
  return `v${max + 1}`;
}

/** Preparation steps of the published release, with Activate / Retry. */
export function ReleaseCard({ versions, isEditor }: { versions: VersionsResponse; isEditor: boolean }) {
  const release = versions.release;
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const activate = useActivate();
  const retry = useRetryPreparation();
  if (!release || release.state === 'active') return null;

  const title = release.state === 'failed' ? 'Preparation failed' : STATE_LABEL[release.state];
  const text = release.state === 'failed'
    ? `Preparation stopped. ${release.id} is published but can't be activated until preparation succeeds.`
    : `Published and immutable. ${versions.activeVersion} keeps classifying new notes until ${release.id} is activated.`;

  return (
    <section aria-labelledby="lb-release-title" className={`card lb-release${release.state === 'failed' ? ' failed' : ''}`}>
      <div className="lb-row-between">
        <h2 id="lb-release-title">Taxonomy {release.id} · {title}</h2>
        {isEditor && release.state === 'ready' && (
          <button type="button" className="btn btn-primary" onClick={() => setConfirm(true)}>Activate {release.id}</button>
        )}
        {isEditor && release.state === 'failed' && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={retry.isPending}
            onClick={() => retry.mutate(release.id, { onSuccess: () => toast.show({ text: 'Preparation restarted.' }) })}
          >
            {retry.isPending ? 'Retrying…' : 'Retry preparation'}
          </button>
        )}
      </div>
      <p className="card-caption">{text}</p>
      {release.error && (
        <div role="alert" className="banner error">
          <span><strong>{release.error.code}:</strong> {release.error.message}</span>
        </div>
      )}
      <ol className="lb-steps" aria-live="polite">
        {release.steps.map((s) => (
          <li key={s.label}>
            <span className={`chip lb-step-chip ${s.state === 'done' ? 'chip-violet' : s.state === 'running' ? 'chip-warm' : s.state === 'failed' ? 'chip-failed' : 'chip-neutral'}`}>
              {s.state === 'done' ? 'Done' : s.state === 'running' ? 'Running' : s.state === 'failed' ? 'Failed' : 'Waiting'}
            </span>
            <span style={{ flex: 1 }}>{s.label}</span>
            <span className="small muted">{s.at ?? ''}</span>
          </li>
        ))}
      </ol>
      {retry.isError && <div role="alert" className="banner error">Couldn't restart preparation. Try again.</div>}
      {confirm && (
        <ConfirmDialog
          title={`Activate ${release.id}?`}
          body={`New support notes will be classified with ${release.id} from now on. ${versions.activeVersion} stays available for past analysis.${release.historical === 'reprocess' ? ' Reprocessing of the last 90 days will start.' : ''}`}
          confirmLabel={`Activate ${release.id}`}
          busy={activate.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            activate.mutate(release.id, {
              onSuccess: () => {
                setConfirm(false);
                toast.show({ text: `${release.id} is active. New notes are classified with ${release.id}.` });
              },
              onError: () => {
                setConfirm(false);
                toast.show({ text: `Couldn't activate ${release.id}. Try again.` });
              }
            })
          }
        />
      )}
    </section>
  );
}

/** Version history with a change log per version. */
export function VersionHistory({ versions }: { versions: VersionsResponse }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <section className="card" aria-labelledby="lb-history-title">
      <h2 id="lb-history-title">Version history</h2>
      <ol className="lb-history">
        {versions.versions.map((v) => (
          <li key={v.id}>
            <div className="lb-row-between">
              <span style={{ fontWeight: 600 }}>{v.id}</span>
              <span className={`chip ${stateChip(v.state)}`}>{STATE_LABEL[v.state] ?? v.state}</span>
            </div>
            <div className="small muted">
              {v.publishedAt ? `Published ${v.publishedAt}` : 'Not published'}{v.publishedBy ? ` by ${v.publishedBy}` : ''}{v.summary ? ` · ${v.summary}` : ''}
            </div>
            {v.log.length > 0 && (
              <>
                <button
                  type="button"
                  className="link-btn"
                  style={{ fontSize: 12, marginTop: 4 }}
                  aria-expanded={!!open[v.id]}
                  aria-controls={`lb-log-${v.id}`}
                  onClick={() => setOpen({ ...open, [v.id]: !open[v.id] })}
                >
                  {open[v.id] ? 'Hide change log' : 'View change log'}
                </button>
                {open[v.id] && (
                  <ul id={`lb-log-${v.id}`} className="lb-log">
                    {v.log.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
      <p className="small muted" style={{ margin: '10px 0 0', lineHeight: 1.5 }}>
        Published versions are immutable. Comparing data across versions with changed topics needs a version mapping or explicit reprocessing.
      </p>
    </section>
  );
}
