import type { ReactNode } from 'react';
import { ApiRequestError } from '../api/client';

export function PageSkeleton() {
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span className="sr-only">Loading</span>
      <div className="skeleton" style={{ height: 36, width: '38%' }} />
      <div className="auto-grid">
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 96 }} />
      </div>
      <div className="skeleton" style={{ height: 300 }} />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiRequestError ? error.message : 'The service did not respond.';
  const code = error instanceof ApiRequestError ? error.code : 'network';
  return (
    <div role="alert" className="banner error" style={{ flexDirection: 'column', alignItems: 'flex-start', padding: '20px 22px', fontSize: 14 }}>
      <strong>Couldn't load this page</strong>
      <span>{msg} (reference {code})</span>
      {onRetry && <button type="button" className="btn btn-primary" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state-box">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
