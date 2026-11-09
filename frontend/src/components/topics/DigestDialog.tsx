import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DigestRequest, DigestStatus } from '@cti/shared';
import { apiSend } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Modal } from '../Modal';
import { useToast } from '../Toast';

interface Props {
  topicId: string;
  subId: string;
  scopeLabel: string;
  status: DigestStatus;
  onClose: () => void;
}

export function DigestDialog({ topicId, subId, scopeLabel, status, onClose }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [frequency, setFrequency] = useState<'weekly' | 'daily'>(status.frequency ?? 'weekly');
  const [done, setDone] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => apiSend<DigestStatus>('POST', '/digests', { topicId, subId, frequency } satisfies DigestRequest),
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['topic'] });
      setDone(`Subscribed. Your first ${s.frequency} digest arrives ${s.firstSend}.`);
    }
  });
  const remove = useMutation({
    mutationFn: () => apiSend<DigestStatus>('DELETE', '/digests', undefined, { topicId, subId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['topic'] });
      setDone("Unsubscribed. You won't get digests for this topic.");
    }
  });

  const close = () => {
    if (done) toast.show({ text: done });
    onClose();
  };

  return (
    <Modal title={status.subscribed ? 'Manage digest' : 'Get a digest for this topic'} onClose={close}>
      {done ? (
        <>
          <div role="status" className="banner">{done}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={close}>Done</button>
          </div>
        </>
      ) : (
        <>
          <div className="note-body" style={{ fontSize: 13 }}>
            <strong>Topic:</strong> {scopeLabel}
            <br />
            <strong>Sent to:</strong> {user?.name} (your work email)
          </div>
          <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
            <legend style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Frequency</legend>
            <label style={{ display: 'flex', gap: 8 }}><input type="radio" name="freq" checked={frequency === 'weekly'} onChange={() => setFrequency('weekly')} /> Weekly, Mondays at 8:00 AM PT</label>
            <label style={{ display: 'flex', gap: 8 }}><input type="radio" name="freq" checked={frequency === 'daily'} onChange={() => setFrequency('daily')} /> Daily on weekdays, 8:00 AM PT</label>
          </fieldset>
          <p className="small muted" style={{ margin: 0 }}>Includes note volume, biggest changes and new candidate topics for this topic.</p>
          {(save.isError || remove.isError) && <div role="alert" className="banner error">Couldn't save. Try again.</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {status.subscribed && (
              <button type="button" className="link-btn" style={{ marginRight: 'auto', color: '#8A4A16', fontSize: 14 }} onClick={() => remove.mutate()} disabled={remove.isPending}>
                Unsubscribe
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : status.subscribed ? 'Save changes' : 'Subscribe'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
