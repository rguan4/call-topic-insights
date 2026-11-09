import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DraftChangeRequest, RangeKey, TaxonomyTopicDetail } from '@cti/shared';
import { ApiRequestError } from '../../api/client';
import { num } from '../../lib/format';
import { useNoteDrawer } from '../NoteDrawer';
import { ErrorState } from '../States';
import { useToast } from '../Toast';
import { chipFor, useCompare, useCreateDraft, useTopicDetail } from './api';

type Action = 'rename' | 'move' | 'compare' | 'merge';

interface Props {
  id: string;
  range: RangeKey;
  isEditor: boolean;
  reviewHref: string;
}

/** Right-hand panel: details of the selected topic and its edit actions. */
export function TopicPanel({ id, range, isEditor, reviewHref }: Props) {
  const q = useTopicDetail(id, range);
  const [action, setAction] = useState<Action | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    setAction(null);
    setDone(null);
  }, [id]);

  if (q.isPending) return <section className="card lb-panel"><div className="skeleton" style={{ height: 320 }} role="status" aria-label="Loading topic" /></section>;
  if (q.isError) return <section className="card lb-panel"><ErrorState error={q.error} onRetry={() => q.refetch()} /></section>;
  const d = q.data;

  const actions: { key: Action; label: string; enabled: boolean; why: string }[] = [
    { key: 'rename', label: 'Rename', enabled: d.actions.rename, why: '' },
    { key: 'move', label: 'Move', enabled: d.actions.move, why: "Top-level topics can't be moved" },
    { key: 'compare', label: 'Compare', enabled: d.actions.compare, why: 'Select a subtopic to compare' },
    { key: 'merge', label: 'Merge', enabled: d.actions.merge, why: 'Select a subtopic to merge' }
  ];

  const finish = (text: string) => {
    setAction(null);
    setDone(text);
  };

  return (
    <section aria-labelledby="lb-panel-title" className="card lb-panel">
      <div>
        <div className="small muted">{d.path}</div>
        <h2 id="lb-panel-title" className="lb-panel-title">{d.name}</h2>
        <div className="lb-chips">
          <span className={`chip ${chipFor(d.statusKind)}`}>{d.status}</span>
          <span className="chip chip-neutral">Owner: {d.teamLabel}</span>
        </div>
      </div>
      <p className="lb-def">{d.definition}</p>
      <dl className="lb-facts">
        <dt>Support notes</dt>
        <dd>{num(d.notesInRange)} ({d.span}) · {num(d.notes90)} in 90 days</dd>
        {d.subtopicCount !== null && (<><dt>Subtopics</dt><dd>{d.subtopicCount}</dd></>)}
        {d.similar && (<><dt>Looks like</dt><dd>{d.similar.name} · similarity {d.similar.similarity.toFixed(2)}</dd></>)}
      </dl>
      {d.pendingChanges.length > 0 && (
        <div className="lb-pending">
          {d.pendingChanges.map((c) => (
            <div key={c.id} className="small">
              <strong>Draft {c.type.toLowerCase()}:</strong> {c.title} <span className="muted">· {c.author}</span>
            </div>
          ))}
        </div>
      )}
      {d.kind === 'subtopic' && <RepresentativeNotes d={d} />}

      {isEditor && (
        <div role="group" aria-label="Topic actions" className="lb-actions">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`btn btn-sm ${action === a.key ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={action === a.key}
              disabled={!a.enabled}
              title={a.enabled ? undefined : a.why}
              onClick={() => {
                setDone(null);
                setAction(action === a.key ? null : a.key);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}

      {done && (
        <div role="status" className="banner">
          <span>{done} <Link to={reviewHref} className="lb-inline-link">Review changes</Link></span>
        </div>
      )}

      {action === 'rename' && <RenameForm d={d} onDone={finish} />}
      {action === 'move' && <MoveForm d={d} onDone={finish} />}
      {action === 'compare' && <CompareView d={d} range={range} onMerge={() => setAction('merge')} />}
      {action === 'merge' && <MergeForm d={d} onDone={finish} />}
    </section>
  );
}

function RepresentativeNotes({ d }: { d: TaxonomyTopicDetail }) {
  const { openNote } = useNoteDrawer();
  if (d.notesHidden) return <p className="small muted" style={{ margin: 0 }}>Representative notes are hidden because this topic belongs to a team outside your access.</p>;
  return (
    <div className="lb-notes">
      <div className="small" style={{ fontWeight: 700, color: 'var(--muted)' }}>Representative notes</div>
      {d.notes.map((n) => (
        <button key={n.id} type="button" className="note-card lb-note-btn" onClick={() => openNote(n.id)}>
          “{n.excerpt}” <span className="lb-note-id">{n.id}</span>
        </button>
      ))}
    </div>
  );
}

function useSubmit(onDone: (text: string) => void, doneText: string) {
  const create = useCreateDraft();
  const toast = useToast();
  const submit = (body: DraftChangeRequest) =>
    create.mutate(body, {
      onSuccess: () => {
        toast.show({ text: doneText });
        onDone(doneText);
      }
    });
  const error = create.error instanceof ApiRequestError ? create.error.message : create.isError ? "Couldn't save the change. Try again." : null;
  return { submit, pending: create.isPending, error };
}

function FormShell({ title, children, onSubmit, impact, error, disabled, pending, submitLabel }: {
  title: string;
  children: ReactNode;
  onSubmit: (e: FormEvent) => void;
  impact: string;
  error: string | null;
  disabled: boolean;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <form className="lb-form" onSubmit={onSubmit} aria-label={title}>
      {children}
      <div className="small muted">{impact}</div>
      {error && <div role="alert" className="banner error">{error}</div>}
      <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} disabled={disabled || pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="field lb-field">
      Reason (required)
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} required maxLength={500} />
    </label>
  );
}

function RenameForm({ d, onDone }: { d: TaxonomyTopicDetail; onDone: (t: string) => void }) {
  const [name, setName] = useState(d.name);
  const [reason, setReason] = useState('');
  const { submit, pending, error } = useSubmit(onDone, 'Rename added to the draft.');
  const valid = name.trim() !== '' && name.trim() !== d.name && reason.trim() !== '';
  return (
    <FormShell
      title="Rename topic"
      impact={d.kind === 'subtopic'
        ? `No notes are reassigned. The label changes on ${num(d.notes90)} notes from the last 90 days once the new version is active.`
        : `No notes are reassigned. The parent label changes for ${d.subtopicCount} subtopics.`}
      error={error}
      disabled={!valid}
      pending={pending}
      submitLabel="Add rename to draft"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        submit({ type: 'Renamed', ...(d.kind === 'subtopic' ? { subId: d.id } : { parentId: d.id }), newName: name.trim(), reason: reason.trim() });
      }}
    >
      <label className="field lb-field">
        New name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
      </label>
      <ReasonField value={reason} onChange={setReason} />
    </FormShell>
  );
}

function MoveForm({ d, onDone }: { d: TaxonomyTopicDetail; onDone: (t: string) => void }) {
  const [parent, setParent] = useState('');
  const [reason, setReason] = useState('');
  const { submit, pending, error } = useSubmit(onDone, 'Move added to the draft.');
  const target = d.moveOptions.find((o) => o.id === parent);
  return (
    <FormShell
      title="Move subtopic"
      impact={target
        ? `${num(d.notes90)} notes (last 90 days) move from ${d.parentName} to ${target.name}. Parent-level counts change for both topics.`
        : 'Choose a parent to see the impact.'}
      error={error}
      disabled={!parent || !reason.trim()}
      pending={pending}
      submitLabel="Add move to draft"
      onSubmit={(e) => {
        e.preventDefault();
        if (!parent || !reason.trim()) return;
        submit({ type: 'Moved', subId: d.id, newParentId: parent, reason: reason.trim() });
      }}
    >
      <label className="field lb-field">
        New parent topic
        <select className="select" value={parent} onChange={(e) => setParent(e.target.value)} required>
          <option value="">Choose a parent</option>
          {d.moveOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </label>
      <ReasonField value={reason} onChange={setReason} />
    </FormShell>
  );
}

function MergeForm({ d, onDone }: { d: TaxonomyTopicDetail; onDone: (t: string) => void }) {
  const [target, setTarget] = useState(d.similar?.id ?? '');
  const [reason, setReason] = useState('');
  const { submit, pending, error } = useSubmit(onDone, 'Merge added to the draft.');
  const t = d.mergeOptions.find((o) => o.id === target);
  return (
    <FormShell
      title="Merge subtopic"
      impact={t
        ? `${num(d.notes90)} notes (last 90 days) would be reassigned to ${t.label.split(' › ').pop()}. “${d.name}” is retired in the new version.`
        : 'Choose a topic to see the impact.'}
      error={error}
      disabled={!target || !reason.trim()}
      pending={pending}
      submitLabel="Add merge to draft"
      onSubmit={(e) => {
        e.preventDefault();
        if (!target || !reason.trim()) return;
        submit({ type: 'Merged', subId: d.id, targetSubId: target, reason: reason.trim() });
      }}
    >
      <label className="field lb-field">
        Merge “{d.name}” into
        <select className="select" value={target} onChange={(e) => setTarget(e.target.value)} required>
          <option value="">Choose a topic</option>
          {d.mergeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      <ReasonField value={reason} onChange={setReason} />
    </FormShell>
  );
}

function CompareView({ d, range, onMerge }: { d: TaxonomyTopicDetail; range: RangeKey; onMerge: () => void }) {
  const [other, setOther] = useState(d.similar?.id ?? d.mergeOptions[0]?.id ?? '');
  const q = useCompare(d.id, other, range);
  const { openNote } = useNoteDrawer();
  return (
    <div className="lb-form">
      <label className="field lb-field">
        Compare with
        <select className="select" value={other} onChange={(e) => setOther(e.target.value)}>
          {d.mergeOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </label>
      {q.isPending && <div className="skeleton" style={{ height: 180 }} role="status" aria-label="Loading comparison" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <p className="small" style={{ margin: 0, lineHeight: 1.5 }}>
            <strong>Similarity {q.data.similarity.toFixed(2)}.</strong> <span className="muted">{q.data.disclaimer}</span>
          </p>
          <div className="lb-compare">
            {[q.data.a, q.data.b].map((side) => (
              <div key={side.id} className="lb-compare-side">
                <div className="small muted">{side.parentName} · {num(side.notes)} notes</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{side.name}</div>
                <p className="small" style={{ margin: '4px 0 0', lineHeight: 1.5 }}>{side.definition}</p>
                {side.sampleNotes.length === 0 && <p className="small muted">Notes hidden: outside your access.</p>}
                {side.sampleNotes.map((n) => (
                  <button key={n.id} type="button" className="lb-compare-note" onClick={() => openNote(n.id)}>
                    “{n.excerpt}” <span className="lb-note-id">{n.id}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onMerge}>Merge these topics…</button>
        </>
      )}
    </div>
  );
}
