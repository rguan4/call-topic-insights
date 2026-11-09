import { Link } from 'react-router-dom';
import { useFilters } from '../../hooks/useFilters';
import { useToast } from '../Toast';

/** Shown when a viewer opens a topic owned by a team outside their access. */
export function NoAccess({ topicName, teamName }: { topicName: string; teamName: string }) {
  const { search } = useFilters();
  const toast = useToast();
  return (
    <div className="lock-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#4A32B8" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <h1 className="page-title" style={{ fontSize: 30 }}>You don't have access to this topic</h1>
      <p>
        “{topicName}” is owned by {teamName}. Your access covers Money Movement topics. Ask a Support Insights admin if you need {teamName} data.
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn btn-primary" style={{ textDecoration: 'none' }} to={`/topics${search}`}>Go to your topics</Link>
        <button type="button" className="btn btn-secondary" onClick={() => toast.show({ text: 'Access request sent to Support Insights admins.' })}>
          Request access
        </button>
      </div>
    </div>
  );
}
