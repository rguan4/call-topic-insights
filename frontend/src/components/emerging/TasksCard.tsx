import { useState } from 'react';
import type { TaskInfo } from '@cti/shared';
import { ConfirmDialog } from '../ConfirmDialog';

interface Props {
  tasks: TaskInfo[];
  isEditor: boolean;
  discoveryRunning: boolean;
  runPending: boolean;
  retryPending: boolean;
  onRun: () => void;
  onRetry: (id: string) => void;
}

const LABEL: Record<TaskInfo['status'], string> = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed' };
const CHIP: Record<TaskInfo['status'], string> = { queued: 'chip-neutral', running: 'chip-warm', completed: 'chip-violet', failed: 'chip-failed' };

/** Classification and discovery jobs with progress, error details and retry. */
export function TasksCard({ tasks, isEditor, discoveryRunning, runPending, retryPending, onRun, onRetry }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<TaskInfo | null>(null);

  return (
    <section className="card" aria-labelledby="em-tasks" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 id="em-tasks">Background tasks</h2>
          <p className="card-caption">Classification and discovery jobs. Discovery groups notes with no suitable topic into candidates.</p>
        </div>
        {isEditor && (
          <button type="button" className="btn btn-primary" onClick={onRun} disabled={discoveryRunning || runPending}>
            {discoveryRunning ? 'Discovery running…' : 'Run topic discovery'}
          </button>
        )}
      </div>
      {tasks.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>No tasks in the last 7 days.</p>}
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tasks.map((t) => {
          const failed = t.status === 'failed';
          const isOpen = !!open[t.id];
          const errId = `err-${t.id}`;
          return (
            <li key={t.id} className="em-task">
              <div className="em-task-head">
                <div style={{ minWidth: 0 }}>
                  <div className="em-task-title">{t.title}</div>
                  <div className="small muted" style={{ marginTop: 2 }}>{t.meta}</div>
                  {t.time && <div className="small muted" style={{ marginTop: 2 }}>{t.time}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className={`chip ${CHIP[t.status]}`}>{LABEL[t.status]}</span>
                  {failed && (
                    <button type="button" className="link-btn" aria-expanded={isOpen} aria-controls={errId} onClick={() => setOpen({ ...open, [t.id]: !isOpen })}>
                      {isOpen ? 'Hide error' : 'Inspect error'}
                    </button>
                  )}
                </div>
              </div>
              <div
                className={`progress${failed ? ' failed' : t.status === 'completed' ? ' done' : ''}`}
                role="progressbar"
                aria-label={`${t.title} progress`}
                aria-valuenow={t.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span style={{ width: `${t.progress}%` }} />
              </div>
              {failed && isOpen && t.error && (
                <div id={errId} className="em-error">
                  <dl>
                    <dt>Error</dt><dd style={{ fontWeight: 600 }}>{t.error.code} · {t.error.message}</dd>
                    <dt>Attempts</dt><dd>{t.error.attempts}</dd>
                    <dt>Affected</dt><dd>{t.error.affected}</dd>
                  </dl>
                  <div style={{ marginTop: 6 }}>{t.error.hint}</div>
                  {isEditor ? (
                    <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={retryPending}
                      onClick={() => (t.kind === 'classify' ? setConfirm(t) : onRetry(t.id))}>
                      {t.kind === 'classify' ? 'Retry 37 notes' : 'Retry discovery'}
                    </button>
                  ) : (
                    <div style={{ marginTop: 6, fontWeight: 600 }}>Only editors can retry.</div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {confirm && (
        <ConfirmDialog
          title="Reprocess 37 notes?"
          body="This retries classification for the 37 notes in the failed batch. Other notes and published versions aren't affected."
          confirmLabel="Start reprocessing"
          busy={retryPending}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            onRetry(confirm.id);
            setConfirm(null);
          }}
        />
      )}
    </section>
  );
}
