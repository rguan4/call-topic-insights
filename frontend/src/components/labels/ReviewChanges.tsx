import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { DraftChange } from '@cti/shared';
import { ApiRequestError } from '../../api/client';
import { num } from '../../lib/format';
import { ConfirmDialog } from '../ConfirmDialog';
import { ErrorState, PageSkeleton } from '../States';
import { useToast } from '../Toast';
import { useDeleteDraft, useDrafts, usePublish, useUpdateReason, useVersions } from './api';

const TYPE_CHIP: Record<string, string> = { Added: 'chip-violet', Renamed: 'chip-neutral', Moved: 'chip-neutral', Merged: 'chip-warm' };

/** Review step before publishing the draft as a new immutable version. */
export function ReviewChanges({ backHref }: { backHref: string }) {
  const drafts = useDrafts();
  const versions = useVersions();
  const publish = usePublish();
  const remove = useDeleteDraft();
  const toast = useToast();
  const navigate = useNavigate();
  const [historical, setHistorical] = useState<'keep' | 'reprocess'>('keep');
  const [confirm, setConfirm] = useState(false);

  if (drafts.isPending || versions.isPending) return <PageSkeleton />;
  if (drafts.isError) return <ErrorState error={drafts.error} onRetry={() => drafts.refetch()} />;
  if (versions.isError) return <ErrorState error={versions.error} onRetry={() => versions.refetch()} />;
  const d = drafts.data;
  const v = versions.data;
  const maxId = Math.max(...v.versions.map((x) => Number(x.id.replace(/\D/g, '')) || 0));
  const nextId = `v${maxId + 1}`;
  const s = d.summary;

  return (
    <section aria-labelledby="rc-title" className="card lb-review">
      <Link to={backHref} className="back-link">← Back to topic tree</Link>
      <div>
        <h1 id="rc-title" className="page-title" style={{ fontSize: 30 }}>Review changes for {nextId}</h1>
        <p className="page-sub">Draft based on active version {d.basedOn}. Every change needs a reason before publishing.</p>
      </div>

      <div className="lb-impact">
        <div><div className="small muted">Changes</div><div className="lb-impact-value">{s.total}</div></div>
        <div><div className="small muted">Added · renamed · moved · merged</div><div className="lb-impact-value">{s.added} · {s.renamed} · {s.moved} · {s.merged}</div></div>
        <div><div className="small muted">Notes reassigned (90 days)</div><div className="lb-impact-value">{num(s.notesReassigned)}</div></div>
        <div><div className="small muted">Based on</div><div className="lb-impact-value">{d.basedOn}</div></div>
      </div>

      {d.changes.length === 0 ? (
        <div className="state-box" style={{ padding: 24 }}>
          <h2>No changes in the draft</h2>
          <p>Rename, move or merge topics in the topic tree, or add candidates from Emerging topics.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table lb-review-table">
            <caption className="sr-only">Draft changes for {nextId}</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Change</th>
                <th scope="col">Affected records</th>
                <th scope="col">Author</th>
                <th scope="col">Reason</th>
                <th scope="col"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {d.changes.map((c) => (
                <ChangeRow
                  key={c.id}
                  change={c}
                  removing={remove.isPending && remove.variables === c.id}
                  onRemove={() =>
                    remove.mutate(c.id, {
                      onSuccess: () => toast.show({ text: 'Change removed from the draft.' }),
                      onError: () => toast.show({ text: "Couldn't remove the change. Try again." })
                    })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <fieldset className="lb-fieldset">
        <legend>Historical data</legend>
        <label className="lb-radio">
          <input type="radio" name="historical" checked={historical === 'keep'} onChange={() => setHistorical('keep')} />
          <span>Keep past notes on their {d.basedOn} labels (recommended). Comparisons across {d.basedOn} and {nextId} use a {d.basedOn}→{nextId} mapping.</span>
        </label>
        <label className="lb-radio">
          <input type="radio" name="historical" checked={historical === 'reprocess'} onChange={() => setHistorical('reprocess')} />
          <span>Reprocess the last 90 days with {nextId} (about {num(d.reprocessEstimate)} support notes) as a background task after activation.</span>
        </label>
      </fieldset>
      <p className="small muted" style={{ margin: 0, lineHeight: 1.5 }}>
        Published versions can't be edited. After publishing, {nextId} is prepared (embeddings and classifier validation) and only classifies notes after an editor activates it.
      </p>

      <div className="lb-row" style={{ gap: 12, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary" disabled={!!d.publishBlockedReason || publish.isPending} onClick={() => setConfirm(true)}>
          Publish {nextId}
        </button>
        {d.publishBlockedReason && <span className="small lb-hint">{d.publishBlockedReason}</span>}
      </div>
      {publish.isError && (
        <div role="alert" className="banner error">
          {publish.error instanceof ApiRequestError ? publish.error.message : "Couldn't publish. Try again."}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={`Publish taxonomy ${nextId}?`}
          body={`${nextId} will be saved as an immutable version with ${s.total} change${s.total === 1 ? '' : 's'}. It won't classify notes until its resources are prepared and an editor activates it.${historical === 'reprocess' ? ` After activation, the last 90 days (about ${num(d.reprocessEstimate)} notes) will be reprocessed.` : ` Past notes keep their ${d.basedOn} labels.`}`}
          confirmLabel={`Publish ${nextId}`}
          busy={publish.isPending}
          onCancel={() => setConfirm(false)}
          onConfirm={() =>
            publish.mutate({ historical }, {
              onSuccess: (r) => {
                setConfirm(false);
                toast.show({ text: `${r.id} published. Preparing classification resources.` });
                navigate(backHref);
              },
              onError: () => setConfirm(false)
            })
          }
        />
      )}
    </section>
  );
}

function ChangeRow({ change: c, removing, onRemove }: { change: DraftChange; removing: boolean; onRemove: () => void }) {
  const update = useUpdateReason();
  const [reason, setReason] = useState(c.reason);
  useEffect(() => setReason(c.reason), [c.reason]);
  const empty = !reason.trim();
  const save = () => {
    if (reason !== c.reason) update.mutate({ id: c.id, reason });
  };
  return (
    <tr>
      <td><span className={`chip ${TYPE_CHIP[c.type] ?? 'chip-neutral'}`}>{c.type}</span></td>
      <td><div style={{ fontWeight: 600 }}>{c.title}</div><div className="small muted">{c.detail}</div></td>
      <td className="small">{c.affected}</td>
      <td className="small" style={{ whiteSpace: 'nowrap' }}>{c.author}{c.editable ? ' (you)' : ''}</td>
      <td style={{ minWidth: 240 }}>
        {c.editable ? (
          <>
            <input
              className={`input lb-reason${empty ? ' missing' : ''}`}
              aria-label={`Reason for ${c.title}`}
              aria-invalid={empty}
              placeholder="Why is this change needed? (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            />
            {update.isPending && <span className="small muted">Saving…</span>}
            {update.isError && <span role="alert" className="small lb-hint">Couldn't save. Try again.</span>}
          </>
        ) : (
          <span className="small">{c.reason || <span className="muted">No reason yet</span>}</span>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>
        {c.editable && (
          <button type="button" className="link-btn" aria-label={`Remove change: ${c.title}`} onClick={onRemove} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
      </td>
    </tr>
  );
}
