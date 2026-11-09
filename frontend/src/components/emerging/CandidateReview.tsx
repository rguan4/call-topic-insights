import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CandidateAction, CandidateDecisionRequest, CandidateDecisionResponse, CandidateDetail } from '@cti/shared';
import { ApiRequestError, apiGet, apiSend } from '../../api/client';
import { num } from '../../lib/format';
import { useNoteDrawer } from '../NoteDrawer';
import { ErrorState } from '../States';
import { useToast } from '../Toast';

const CHIP: Record<CandidateDetail['status'], string> = { review: 'chip-warm', draft: 'chip-violet', merged: 'chip-violet', dismissed: 'chip-neutral' };
const DISMISS_REASONS = ['Not a distinct client issue', 'Too few notes to act on', 'Duplicate or test notes', 'Other'];

interface Form {
  name: string;
  description: string;
  parentId: string;
  action: CandidateAction;
  targetSubId: string;
  reason: string;
  comment: string;
}

/** Review one candidate: edit name/description/parent, then add to draft, merge or dismiss. */
export function CandidateReview({ id, isEditor, search }: { id: string; isEditor: boolean; search: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { openNote } = useNoteDrawer();
  const q = useQuery({ queryKey: ['candidate', id], queryFn: () => apiGet<CandidateDetail>(`/candidates/${id}`) });
  const [form, setForm] = useState<Form | null>(null);
  const [done, setDone] = useState<{ text: string; action: CandidateAction } | null>(null);

  useEffect(() => {
    setDone(null);
    setForm(null);
  }, [id]);

  useEffect(() => {
    if (q.data && !form) {
      setForm({
        name: q.data.name, description: q.data.description, parentId: q.data.suggestedParentId,
        action: 'add', targetSubId: q.data.closest[0]?.subId ?? '', reason: '', comment: ''
      });
    }
  }, [q.data, form]);

  const decide = useMutation({
    mutationFn: (body: CandidateDecisionRequest) => apiSend<CandidateDecisionResponse>('POST', `/candidates/${id}/decision`, body),
    onSuccess: (res, body) => {
      qc.setQueryData(['candidate', id], res.candidate);
      qc.invalidateQueries({ queryKey: ['emerging'] });
      qc.invalidateQueries({ queryKey: ['meta'] });
      qc.invalidateQueries({ queryKey: ['overview'] });
      setDone({ text: res.message, action: body.action });
      toast.show({ text: body.action === 'dismiss' ? 'Candidate dismissed.' : body.action === 'add' ? 'Added to draft v8.' : 'Merge added to draft v8.' });
    }
  });

  if (q.isPending) return <div className="skeleton" style={{ height: 420 }} role="status" aria-label="Loading candidate" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const c = q.data;
  const f = form;
  const decided = c.status !== 'review';
  const readOnly = !isEditor || decided;
  const set = (patch: Partial<Form>) => f && setForm({ ...f, ...patch });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f) return;
    decide.mutate({
      action: f.action, name: f.name, description: f.description, parentId: f.parentId,
      targetSubId: f.action === 'merge' ? f.targetSubId : undefined,
      reason: f.action === 'dismiss' ? f.reason : undefined, comment: f.action === 'dismiss' ? f.comment : undefined
    });
  };

  const disabled = !f || readOnly || decide.isPending || (f.action === 'dismiss' && !f.reason) || (f.action === 'add' && !f.name.trim()) || (f.action === 'merge' && !f.targetSubId);
  const label = decided ? 'Decision recorded' : f?.action === 'merge' ? 'Add merge to draft' : f?.action === 'dismiss' ? 'Dismiss candidate' : 'Add to draft taxonomy';

  return (
    <section aria-labelledby="em-review-title" className="em-review">
      <Link to={`/emerging${search}`} className="back-link">← All candidates</Link>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div>
          <div className="small muted">Review candidate</div>
          <h2 id="em-review-title" className="em-review-title">{c.name}</h2>
          <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>{num(c.notes)} notes with no suitable topic · {c.range} · trend: {c.trend}</div>
        </div>
        <span className={`chip ${CHIP[c.status]}`}>Review status: {c.statusLabel}</span>
      </div>

      {done && (
        <div role="status" className="banner" style={{ flexWrap: 'wrap', fontSize: 14 }}>
          <span style={{ flex: '1 1 260px' }}>{done.text}</span>
          {done.action !== 'dismiss' && <Link className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }} to={`/labels/review${search}`}>Review changes</Link>}
          <Link className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }} to={`/emerging${search}`}>Back to candidates</Link>
        </div>
      )}
      {!isEditor && <div role="note" className="banner" style={{ background: '#EFEDF7' }}>View only. Editors add, merge or dismiss candidates.</div>}
      {isEditor && decided && !done && c.decision && (
        <div role="note" className="banner" style={{ background: '#EFEDF7' }}>
          {c.decision.text} Decided by {c.decision.by}, {c.decision.at}.{c.decision.reason ? ` Reason: ${c.decision.reason}.` : ''}
        </div>
      )}

      {f && (
        <form className="em-cols" onSubmit={submit}>
          <div>
            <label className="field" style={{ fontSize: 13, color: 'var(--ink)' }}>
              Suggested name
              <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} disabled={readOnly} />
            </label>
            <label className="field" style={{ fontSize: 13, color: 'var(--ink)' }}>
              Description
              <textarea className="input em-textarea" rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} disabled={readOnly} />
            </label>
            <label className="field" style={{ fontSize: 13, color: 'var(--ink)' }}>
              Suggested parent topic
              <select className="select" value={f.parentId} onChange={(e) => set({ parentId: e.target.value })} disabled={readOnly}>
                {c.parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Representative notes</h3>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.representativeNotes.map((n) => (
                  <li key={n.id}>
                    <button type="button" className="note-card" onClick={() => openNote(n.id)}>
                      <span style={{ display: 'block', fontSize: 14, lineHeight: 1.5 }}>“{n.excerpt}”</span>
                      <span className="small muted" style={{ display: 'block', marginTop: 4 }}>{n.id} · {n.date}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Closest existing topics</h3>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.closest.map((t) => (
                  <li key={t.subId} style={{ fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span><strong>{t.name}</strong> <span className="muted">· {t.parentName}</span></span>
                      <span>{t.similarity.toFixed(2)}</span>
                    </div>
                    <div className="em-sim" aria-hidden="true"><span style={{ width: `${t.similarity * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
              <p className="small muted" style={{ margin: '8px 0 0', lineHeight: 1.5 }}>
                Similarity shows how close the notes are in meaning. It's a review signal, not the probability that a merge is correct.
              </p>
            </div>
            <fieldset className="em-decision" disabled={readOnly}>
              <legend>Decision</legend>
              <label className="em-radio"><input type="radio" name="cand-action" checked={f.action === 'add'} onChange={() => set({ action: 'add' })} />Add to draft taxonomy</label>
              <label className="em-radio"><input type="radio" name="cand-action" checked={f.action === 'merge'} onChange={() => set({ action: 'merge' })} />Merge into an existing topic</label>
              {f.action === 'merge' && (
                <select className="select" aria-label="Topic to merge into" value={f.targetSubId} onChange={(e) => set({ targetSubId: e.target.value })}>
                  {c.closest.map((t) => <option key={t.subId} value={t.subId}>{t.name} ({t.parentName})</option>)}
                </select>
              )}
              <label className="em-radio"><input type="radio" name="cand-action" checked={f.action === 'dismiss'} onChange={() => set({ action: 'dismiss' })} />Dismiss</label>
              {f.action === 'dismiss' && (
                <>
                  <select className="select" aria-label="Reason for dismissing" value={f.reason} onChange={(e) => set({ reason: e.target.value })} required>
                    <option value="">Choose a reason (required)</option>
                    {DISMISS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input className="input" aria-label="Comment (optional)" placeholder="Comment (optional)" value={f.comment} onChange={(e) => set({ comment: e.target.value })} />
                </>
              )}
              {decide.isError && (
                <div role="alert" className="banner error">
                  {decide.error instanceof ApiRequestError ? decide.error.message : 'Couldn\'t save the decision. Try again.'}
                </div>
              )}
              <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={disabled}>
                {decide.isPending ? 'Saving…' : label}
              </button>
            </fieldset>
          </div>
        </form>
      )}
    </section>
  );
}
