import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useFilters } from '../hooks/useFilters';
import { useMeta } from '../hooks/useMeta';
import { Modal } from './Modal';
import { NoteDrawerProvider } from './NoteDrawer';
import { ToastProvider } from './Toast';

const NAV: { to: string; label: string; end?: boolean; badge?: 'candidates' | 'drafts' }[] = [
  { to: '/', label: 'Overview', end: true },
  { to: '/topics', label: 'Topics' },
  { to: '/notes', label: 'Support notes' },
  { to: '/emerging', label: 'Emerging topics', badge: 'candidates' },
  { to: '/labels', label: 'Label management', badge: 'drafts' }
];

export function AppLayout() {
  const { search } = useFilters();
  const meta = useMeta().data;
  const { user } = useAuth();
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // Move focus to the page heading after navigation, for keyboard and screen reader users.
  useEffect(() => {
    const h = mainRef.current?.querySelector('h1');
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E9A86B" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="8" r="3" /><circle cx="17" cy="7" r="2" /><circle cx="15" cy="17" r="4" />
          </svg>
          Call Topic Insights
        </div>
        {NAV.map((n) => {
          const count = n.badge === 'candidates' ? meta?.badges.candidatesNeedingReview ?? 0
            : n.badge === 'drafts' && user?.role === 'editor' ? meta?.badges.draftChanges ?? 0 : 0;
          return (
            <NavLink key={n.to} to={n.to + search} end={n.end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              {n.label}
              {count > 0 && (
                <span className="nav-badge" aria-label={n.badge === 'candidates' ? `${count} candidates need review` : `${count} draft changes`}>{count}</span>
              )}
            </NavLink>
          );
        })}
        <div className="sidebar-foot">
          Active taxonomy {meta?.activeVersion ?? '…'}
          <br />
          Data synced {meta?.syncedAt ?? '…'}
        </div>
      </nav>
      <div className="content">
        <Header />
        <ToastProvider>
          <NoteDrawerProvider>
            <main ref={mainRef} className="main">
              <Outlet />
            </main>
          </NoteDrawerProvider>
        </ToastProvider>
      </div>
    </div>
  );
}

function Header() {
  const navigate = useNavigate();
  const { search } = useFilters();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    const params = new URLSearchParams(search.slice(1));
    params.set('q', query);
    navigate(`/search?${params}`);
  };
  return (
    <header className="header">
      <form role="search" className="search" onSubmit={submit}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5B5675" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <label htmlFor="global-search" className="sr-only">Search topics and notes by meaning</label>
        <input id="global-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search topics and notes by meaning" />
        <button type="submit" className="btn btn-primary btn-sm" style={{ height: 34 }}>Search</button>
      </form>
      <div style={{ marginLeft: 'auto' }}>
        <AccountMenu />
      </div>
    </header>
  );
}

function AccountMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) firstRef.current?.focus();
  }, [open]);

  if (!user) return null;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      btnRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      const i = items.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next]?.focus();
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button ref={btnRef} type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu for ${user.name}`} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{user.initials}</span>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{user.firstName}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5B5675" strokeWidth="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 25 }} onClick={() => setOpen(false)} />
          <div className="menu" role="menu" aria-label="Account" onKeyDown={onKey}>
            <div style={{ padding: '10px 12px 12px', borderBottom: '1px solid #EFEDF7' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{user.name}</div>
              <div className="small muted" style={{ marginTop: 2 }}>{user.team}</div>
              <span className="chip chip-violet" style={{ marginTop: 8 }}>{user.role === 'editor' ? 'Editor' : 'Viewer'}</span>
            </div>
            <button ref={firstRef} type="button" role="menuitem" className="menu-item" style={{ marginTop: 6 }} onClick={() => { setOpen(false); setHelp(true); }}>
              Help &amp; documentation
            </button>
            <button type="button" role="menuitem" className="menu-item" onClick={() => { signOut(); navigate('/signin'); }}>
              Sign out
            </button>
          </div>
        </>
      )}
      {help && (
        <Modal title="Help & documentation" onClose={() => setHelp(false)}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7 }}>
            <li>Filters apply to Overview, Topics and Support notes. Emerging topics are company-wide.</li>
            <li>AI insights cover the topic and dates you choose. Always check the supporting notes.</li>
            <li>Editors propose taxonomy changes in a draft. Nothing changes until a version is published and activated.</li>
          </ul>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Questions? Contact the Support Insights team in #support-insights.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" onClick={() => setHelp(false)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
