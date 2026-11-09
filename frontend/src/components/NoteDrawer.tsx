import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NoteDetail, ReportRequest } from '@cti/shared';
import { apiGet, apiSend } from '../api/client';
import { useMeta } from '../hooks/useMeta';
import { trapTab } from '../lib/focus';
import { ErrorState } from './States';

interface DrawerValue {
  /** Open the drawer for a note. Focus returns to the element that had focus when it closes. */
  openNote: (id: string, opts?: { version?: string }) => void;
  /** The note currently open, so lists can highlight its row. */
  openId: string | null;
}

const DrawerContext = createContext<DrawerValue>({ openNote: () => undefined, openId: null });

export function NoteDrawerProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ id: string; version?: string } | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const openNote = useCallback((id: string, opts?: { version?: string }) => {
    returnTo.current = document.activeElement as HTMLElement | null;
    setCurrent({ id, version: opts?.version });
  }, []);

  const close = useCallback(() => {
    setCurrent(null);
    const el = returnTo.current;
    setTimeout(() => {
      if (el && el.isConnected) el.focus();
    }, 0);
  }, []);

  return (
    <DrawerContext.Provider value={{ openNote, openId: current?.id ?? null }}>
      {children}
      {current && <Drawer id={current.id} version={current.version} onClose={close} />}
    </DrawerContext.Provider>
  );
}

export function useNoteDrawer(): DrawerValue {
  return useContext(DrawerContext);
}

const REASONS = [
  { value: 'Wrong topic', label: 'Wrong topic' },
  { value: 'Should be no suitable topic', label: 'Should be “No suitable topic”' },
  { value: 'Note covers several issues', label: 'Note covers several issues' },
  { value: 'Other', label: 'Other' }
];

function statusClass(s: string) {
  return s === 'Classified' ? 'chip-violet' : s === 'Low confidence' ? 'chip-warm' : s === 'Reported' ? 'chip-dark' : 'chip-neutral';
}

function Drawer({ id, version, onClose }: { id: string; version?: string; onClose: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();
  const meta = useMeta().data;
  const q = useQuery({ queryKey: ['note', id, version], queryFn: () => apiGet<NoteDetail>(`/notes/${id}`, { version }) });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<{ reason: string; suggestedSubId: string; comment: string }>({ reason: '', suggestedSubId: '', comment: '' });
  const [sentRef, setSentRef] = useState<string | null>(null);

  const report = useMutation({
    mutationFn: (body: ReportRequest) => apiSend<NoteDetail>('POST', `/notes/${id}/reports`, body, { version }),
    onSuccess: (detail) => {
      qc.setQueryData(['note', id, version], detail);
      qc.invalidateQueries({ queryKey: ['notes'] });
      setSentRef(detail.report?.ref ?? null);
      setFormOpen(false);
      // The form is gone; keep focus inside the drawer.
      setTimeout(() => closeRef.current?.focus(), 0);
    }
  });

  useEffect(() => {
    closeRef.current?.focus();
    // Escape closes the drawer even when focus has left it (e.g. after a form unmounts).
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, [onClose]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') trapTab(e, ref.current);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.reason) return;
    report.mutate({ reason: form.reason, suggestedSubId: form.suggestedSubId || null, comment: form.comment });
  };

  const d = q.data;
  return createPortal(
    <>
      <div className="backdrop drawer-backdrop" onClick={onClose} />
      <aside ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onKeyDown={onKeyDown}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="small muted">Support note</div>
            <h2 id="drawer-title" className="drawer-title">{id}</h2>
          </div>
          <button ref={closeRef} type="button" className="icon-btn" style={{ width: 40, height: 40, fontSize: 20 }} onClick={onClose} aria-label="Close note">×</button>
        </div>
        {q.isPending && <div className="skeleton" style={{ height: 160 }} role="status" aria-label="Loading note" />}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {d && (
          <>
            <div className="note-body">{d.full}</div>
            <div className="small muted">Names, account numbers and contact details are redacted.</div>
            <dl className="drawer-facts">
              <dt>Date and time</dt><dd>{d.dateTime}</dd>
              <dt>Topic path</dt><dd style={{ fontWeight: 600 }}>{d.topicPath}</dd>
              <dt>Taxonomy</dt><dd>Taxonomy {d.version}</dd>
              <dt>Classification</dt>
              <dd>
                <span className={`chip ${statusClass(d.status)}`}>{d.status}</span>{' '}
                {d.confidence !== null && <span className="small muted">confidence {d.confidence.toFixed(2)}</span>}
              </dd>
              <dt>Handling status</dt><dd>{d.handling}</dd>
            </dl>

            {d.canReport && !formOpen && !sentRef && (
              <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setFormOpen(true)}>
                Report incorrect classification
              </button>
            )}

            {formOpen && (
              <form onSubmit={submit} aria-labelledby="report-title" className="report-form">
                <h3 id="report-title" style={{ margin: 0, fontSize: 15 }}>Report incorrect classification</h3>
                <label className="field">
                  What's wrong?
                  <select className="select" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required>
                    <option value="">Choose a reason (required)</option>
                    {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </label>
                <label className="field">
                  Better topic (optional)
                  <select className="select" value={form.suggestedSubId} onChange={(e) => setForm({ ...form, suggestedSubId: e.target.value })}>
                    <option value="">Not sure</option>
                    {(meta?.subtopics ?? []).map((s) => <option key={s.id} value={s.id}>{s.parentName} › {s.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  Details (optional)
                  <textarea className="input" style={{ height: 'auto', padding: '8px 10px' }} rows={3} value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} />
                </label>
                {report.isError && <div role="alert" className="banner error">Couldn't send the report. Try again.</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary" disabled={!form.reason || report.isPending}>{report.isPending ? 'Sending…' : 'Submit report'}</button>
                  <button type="button" className="link-btn" style={{ fontSize: 14 }} onClick={() => setFormOpen(false)}>Cancel</button>
                </div>
              </form>
            )}

            {sentRef && (
              <div role="status" className="banner">
                <span><strong>Report submitted ({sentRef}).</strong> The note is now marked “Reported”. A taxonomy editor reviews reports within 2 business days.</span>
              </div>
            )}
            {!sentRef && d.report && (
              <div className="banner" style={{ background: '#EFEDF7' }}>Already reported ({d.report.ref}: {d.report.reason}). Waiting for review.</div>
            )}
          </>
        )}
      </aside>
    </>,
    document.body
  );
}
