import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ExportRequest, ExportResponse, Filters } from '@cti/shared';
import { apiSend } from '../../api/client';
import { num } from '../../lib/format';
import { Modal } from '../Modal';
import { useToast } from '../Toast';

interface Props {
  topicId: string;
  subId: string;
  scopeLabel: string;
  rows: number;
  filters: Filters;
  onClose: () => void;
}

export function ExportDialog({ topicId, subId, scopeLabel, rows, filters, onClose }: Props) {
  const toast = useToast();
  const [includeText, setIncludeText] = useState(true);
  const m = useMutation({
    mutationFn: () => apiSend<ExportResponse>('POST', '/exports', { topicId, subId, includeText } satisfies ExportRequest, filters)
  });

  return (
    <Modal title="Export support notes" onClose={onClose}>
      {m.isIdle && (
        <>
          <div className="note-body" style={{ fontSize: 13 }}>
            <strong>Scope:</strong> {scopeLabel}
            <br />
            <strong>Rows:</strong> {num(rows)} support notes
          </div>
          <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Columns</legend>
            <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked disabled /> Note ID, date and time, topic path, classification, handling status</label>
            <label style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={includeText} onChange={(e) => setIncludeText(e.target.checked)} /> Redacted note text</label>
          </fieldset>
          <p className="small muted" style={{ margin: 0 }}>Exports contain redacted text only and follow your team access.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => m.mutate()}>Export CSV</button>
          </div>
        </>
      )}
      {m.isPending && (
        <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          Preparing {num(rows)} rows…
          <div className="skeleton" style={{ height: 8 }} />
        </div>
      )}
      {m.isError && (
        <>
          <div role="alert" className="banner error">Couldn't create the export. Try again.</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" onClick={() => m.mutate()}>Try again</button>
          </div>
        </>
      )}
      {m.isSuccess && (
        <>
          <div role="status" className="banner">
            <span><strong>Export ready.</strong> {m.data.fileName} · {num(m.data.rows)} rows. The link expires {m.data.expiresAt}.</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" onClick={() => { onClose(); toast.show({ text: `Downloading ${m.data.fileName}.` }); }}>Download</button>
          </div>
        </>
      )}
    </Modal>
  );
}
