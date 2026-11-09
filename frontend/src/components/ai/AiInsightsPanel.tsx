import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { InsightResult, InsightScope, RangeKey, TeamScope } from '@cti/shared';
import { useFilters } from '../../hooks/useFilters';
import { useNoteDrawer } from '../NoteDrawer';
import { sameScope, useInsights } from './useInsights';
import '../../styles/ai.css';

/** Owner: AI insights service. Rendered in the right column of Topic detail. */
export interface AiScope {
  topicId: string;
  /** Subtopic ID, or 'all' to analyze the whole topic. */
  subId: string;
  range: RangeKey;
  version: string;
  team: TeamScope;
}

type View = 'initial' | 'generating' | 'regenerating' | 'completed' | 'outdated' | 'insufficient' | 'failed';

const STEPS = ['Sampling notes in scope', 'Finding recurring issues', 'Linking supporting notes'];
const REPORT_REASONS = ['Finding not supported by the notes', 'Important issue missing', 'Wrong or sensitive content', 'Other'];

const scopeText = (s: InsightScope) => `${s.topicLabel} · ${s.span} · taxonomy ${s.version}`;
const n = (v: number) => v.toLocaleString('en-US');

export function AiInsightsPanel({ scope }: { scope: AiScope }) {
  const ai = useInsights(scope);
  const { update, search } = useFilters();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const cur = ai.current;
  const running = cur?.status === 'running' || ai.starting;
  const matches = cur ? sameScope(cur.scope, scope) : false;

  let view: View = 'initial';
  if (running && ai.previous) view = 'regenerating';
  else if (running) view = 'generating';
  else if (cur?.status === 'completed') view = matches ? 'completed' : 'outdated';
  else if (cur?.status === 'insufficient' && matches) view = 'insufficient';
  else if (cur?.status === 'failed' && matches) view = 'failed';

  const shown: InsightResult | null = view === 'regenerating' ? ai.previous : view === 'completed' || view === 'outdated' ? cur : null;

  // Keep keyboard focus in the panel when the button that had it goes away.
  const lastView = useRef(view);
  useEffect(() => {
    if (lastView.current !== view) {
      const a = document.activeElement;
      if (!a || a === document.body || !a.isConnected) headingRef.current?.focus();
      lastView.current = view;
    }
  }, [view]);

  // The strip describes the result when it matches the current filters, otherwise what a new run would cover.
  const strip: InsightScope | undefined = view === 'completed' && cur ? cur.scope : ai.preview.data;

  return (
    <section className="card ai-panel" aria-labelledby="ai-title">
      <div className="ai-head">
        <h2 id="ai-title" ref={headingRef} tabIndex={-1} className="ai-title">AI Topic Insights</h2>
        <span className="chip chip-violet">Beta</span>
      </div>

      <dl className="ai-scope">
        <dt>Topic</dt><dd className="strong">{strip?.topicLabel ?? '…'}</dd>
        <dt>Dates</dt><dd>{strip?.span ?? '…'}</dd>
        <dt>Team</dt><dd>{strip ? `${strip.teamLabel} filter · owned by ${strip.ownerTeamLabel}` : '…'}</dd>
        <dt>Taxonomy</dt><dd>{strip ? `Taxonomy ${strip.version}` : '…'}</dd>
        <dt>Notes</dt><dd>{strip?.notesLabel ?? '…'}</dd>
      </dl>
      <p className="ai-note">AI-generated summary. Review supporting notes before making decisions.</p>

      {ai.latest.isPending && !running && <div className="skeleton" style={{ height: 44 }} role="status" aria-label="Loading insights" />}

      {!ai.latest.isPending && view === 'initial' && (
        <>
          <p className="ai-text">Find recurring issues in this scope and see the notes behind each finding.</p>
          {ai.startError && <div role="alert" className="banner error">Couldn't start the analysis. Try again.</div>}
          <button type="button" className="btn btn-primary ai-wide" onClick={ai.generate} disabled={ai.starting || ai.preview.isError}>
            Generate AI Insights
          </button>
        </>
      )}

      {view === 'generating' && <Generating step={cur?.status === 'running' ? cur.step : 0} />}

      {view === 'regenerating' && (
        <div role="status" className="ai-banner ai-pulse">
          Regenerating with the current scope… The previous result stays visible until the new one is ready.
        </div>
      )}

      {view === 'insufficient' && cur && (
        <>
          <div role="status" className="ai-box neutral">
            <strong>Not enough evidence for reliable findings</strong>
            <span>This scope has {n(cur.scope.totalNotes)} support notes. Insights need at least 40.</span>
          </div>
          <div className="ai-actions">
            {scope.range !== '90d' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => update({ range: scope.range === '7d' ? '30d' : '90d' })}>
                Use a longer date range
              </button>
            )}
            {scope.subId !== 'all' && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/topics/${scope.topicId}${search}`)}>
                Analyze the parent topic
              </button>
            )}
          </div>
        </>
      )}

      {view === 'failed' && cur && (
        <>
          <div role="alert" className="ai-box warm">
            <strong>Couldn't generate insights</strong>
            <span>{cur.error?.message ?? 'The analysis service failed.'} (reference {cur.error?.ref ?? cur.error?.code}). Your filters are unchanged.</span>
          </div>
          <button type="button" className="btn btn-primary ai-wide" onClick={ai.generate} disabled={ai.starting}>Retry</button>
        </>
      )}

      {view === 'outdated' && cur && (
        <>
          <div role="status" className="ai-box warm">
            <strong>Filters changed. These insights are out of date.</strong>
            <span><strong>Result covers:</strong> {scopeText(cur.scope)}</span>
            <span><strong>Current scope:</strong> {ai.preview.data ? scopeText(ai.preview.data) : '…'}</span>
          </div>
          <button type="button" className="btn btn-primary ai-wide" onClick={ai.generate} disabled={ai.starting}>Generate new insights</button>
        </>
      )}

      {shown && (
        <ResultBody
          result={shown}
          dimmed={view !== 'completed'}
          interactive={view === 'completed'}
          onRegenerate={view === 'completed' ? ai.generate : undefined}
          helpful={ai.helpful}
          report={ai.report}
        />
      )}
    </section>
  );
}

function Generating({ step }: { step: number }) {
  return (
    <div role="status" aria-live="polite" className="ai-generating">
      <strong>Generating insights…</strong>
      <ol className="ai-steps">
        {STEPS.map((label, k) => {
          const st = step > k ? 'Done' : step === k ? 'Running' : 'Waiting';
          return (
            <li key={label}>
              <span className={`chip ${st === 'Done' ? 'chip-violet' : st === 'Running' ? 'chip-warm' : 'chip-neutral'}`}>{st}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <span className="small muted">Usually takes 10–20 seconds. You can keep working.</span>
    </div>
  );
}

interface ResultProps {
  result: InsightResult;
  dimmed: boolean;
  interactive: boolean;
  onRegenerate?: () => void;
  helpful: ReturnType<typeof useInsights>['helpful'];
  report: ReturnType<typeof useInsights>['report'];
}

function ResultBody({ result, dimmed, interactive, onRegenerate, helpful, report }: ResultProps) {
  const { openNote } = useNoteDrawer();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const s = result.scope;
  const isHelpful = result.feedback?.helpful === true;
  const reportRef = result.feedback?.reportRef ?? null;

  /** Notes list filtered to one finding, in the result's own scope. */
  const notesLink = (issue: number) => {
    const p = new URLSearchParams({ topic: s.topicId, sub: s.subId, insight: result.id, issue: String(issue), from: 'topic' });
    if (s.range !== '30d') p.set('range', s.range);
    p.set('version', s.version);
    if (s.team !== 'all') p.set('team', s.team);
    return `/notes?${p}`;
  };

  const submitReport = (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return;
    report.mutate({ id: result.id, reason, details }, { onSuccess: () => setReportOpen(false) });
  };

  return (
    <div className={`ai-result${dimmed ? ' dimmed' : ''}`}>
      <section aria-labelledby="ai-sum">
        <h3 id="ai-sum" className="ai-h3">Summary</h3>
        <p className="ai-text">{result.summary}</p>
      </section>

      <section aria-labelledby="ai-iss">
        <h3 id="ai-iss" className="ai-h3">Recurring issues</h3>
        <p className="small muted" style={{ margin: '4px 0 0' }}>One note can mention more than one issue, so percentages can add up to more than 100%.</p>
        <ol className="ai-issues">
          {(result.issues ?? []).map((is, k) => (
            <li key={is.title} className="ai-issue">
              <div className="ai-issue-title">{is.title}</div>
              <div className="ai-share">
                <span className="progress" style={{ flex: 1 }} aria-hidden="true"><span style={{ width: `${is.pct}%` }} /></span>
                <span className="ai-share-label">{is.shareLabel}</span>
              </div>
              <div className="ai-sources">
                <span className="small muted">Sources</span>
                {is.sources.map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    className="ai-source"
                    aria-label={`Open source note ${src.id}`}
                    title={src.excerpt}
                    onClick={() => openNote(src.id, { version: s.version })}
                  >
                    {src.id}
                  </button>
                ))}
              </div>
              <Link className="ai-viewall" to={notesLink(k)}>View all {n(is.supportingCount)} supporting notes →</Link>
            </li>
          ))}
        </ol>
      </section>

      <details className="ai-details">
        <summary>Hypotheses to investigate</summary>
        <p className="small muted" style={{ margin: '8px 0 0' }}>Ideas to test, not proven fixes.</p>
        <ul className="ai-hyps">
          {(result.hypotheses ?? []).map((h) => (
            <li key={h}><span className="chip chip-warm ai-hyp-chip">Hypothesis</span><span>{h}</span></li>
          ))}
        </ul>
      </details>

      <details className="ai-details">
        <summary>Analysis details</summary>
        <dl className="ai-facts">
          <dt>Topic</dt><dd>{s.topicLabel}</dd>
          <dt>Date range</dt><dd>{s.span} ({s.rangeLabel.toLowerCase()})</dd>
          <dt>Team</dt><dd>{s.teamLabel} filter · owned by {s.ownerTeamLabel}</dd>
          <dt>Taxonomy</dt><dd>{s.version}</dd>
          <dt>Notes analyzed</dt><dd>{s.notesLabel}</dd>
          <dt>Sampling</dt><dd>{s.sampled ? 'Sample of 400, spread evenly across the dates' : 'No sampling · every note analyzed'}</dd>
          <dt>Model</dt><dd>{result.model === 'rule-based' ? 'Rule-based summary (no language model configured)' : result.model}</dd>
          <dt>Generated</dt><dd>{result.generatedAt} · took {result.durationLabel}</dd>
        </dl>
      </details>

      {interactive && (
        <>
          <div className="ai-actions">
            <button
              type="button"
              className={`btn btn-sm ${isHelpful ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={isHelpful}
              disabled={helpful.isPending}
              onClick={() => helpful.mutate({ id: result.id, helpful: !isHelpful })}
            >
              {isHelpful ? 'Marked helpful' : 'Helpful'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-expanded={reportOpen}
              disabled={!!reportRef}
              onClick={() => setReportOpen(!reportOpen)}
            >
              {reportRef ? 'Issue reported' : 'Report an issue'}
            </button>
            {onRegenerate && <button type="button" className="link-btn" style={{ marginLeft: 'auto' }} onClick={onRegenerate}>Regenerate</button>}
          </div>
          {isHelpful && <div role="status" className="small muted">Thanks. Your feedback helps tune these insights.</div>}
          {helpful.isError && <div role="alert" className="small" style={{ color: '#8A4A16' }}>Couldn't save feedback. Try again.</div>}

          {reportOpen && !reportRef && (
            <form className="ai-report" onSubmit={submitReport}>
              <label className="field">
                What's wrong?
                <select className="select" value={reason} onChange={(e) => setReason(e.target.value)} required>
                  <option value="">Choose a reason (required)</option>
                  {REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="field">
                Details (optional)
                <textarea className="input" rows={3} style={{ height: 'auto', padding: '8px 10px' }} value={details} onChange={(e) => setDetails(e.target.value)} />
              </label>
              {report.isError && <div role="alert" className="small" style={{ color: '#8A4A16' }}>Couldn't send the report. Try again.</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={!reason || report.isPending}>{report.isPending ? 'Sending…' : 'Send report'}</button>
                <button type="button" className="link-btn" onClick={() => setReportOpen(false)}>Cancel</button>
              </div>
            </form>
          )}
          {reportRef && <div role="status" className="ai-banner">Report sent (reference {reportRef}). The insights team reviews reports within 2 business days.</div>}
        </>
      )}
    </div>
  );
}
