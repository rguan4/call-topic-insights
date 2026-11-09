import type { EmergingResponse } from '@cti/shared';
import { num, pctText } from '../../lib/format';

/** Pending, failed and no-suitable-topic notes. Company-wide. */
export function StatusCards({ data }: { data: EmergingResponse }) {
  return (
    <section aria-label="Notes without a topic" className="em-status-grid">
      <div className="kpi">
        <div className="kpi-label">Pending classification</div>
        <div className="kpi-value" style={{ fontSize: 28 }}>{num(data.pendingClassification)}</div>
        <div className="kpi-note">Waiting in the queue · not used for discovery</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Processing failed</div>
        <div className="kpi-value" style={{ fontSize: 28 }}>{num(data.processingFailed)}</div>
        <div className="kpi-note">{data.processingFailed ? 'Errored during classification · see tasks below' : 'No failed notes'}</div>
      </div>
      <div className="kpi warm" style={{ borderStyle: 'solid' }}>
        <div className="kpi-label">No suitable topic</div>
        <div className="kpi-value" style={{ fontSize: 28 }}>{num(data.noSuitableTopic)}</div>
        <div className="kpi-note">
          {pctText(data.noSuitableTopicPct)} of {num(data.totalNotes)} notes · {data.noSuitableTopicPct > data.thresholdPct ? 'above' : 'below'} the {data.thresholdPct}% threshold · input for discovery
        </div>
      </div>
    </section>
  );
}
