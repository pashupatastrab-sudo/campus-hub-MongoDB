import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import Brand from './Brand.jsx';

const navItems = [
  { to: '/', end: true, icon: '⌂', label: 'Home' },
  { to: '/all', icon: '◉', label: 'Explore' },
  { to: '/c', end: true, icon: '▦', label: 'Communities' },
];

export default function Layout() {
  const { user, unread, logout, isMod, isAdmin } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [mine, setMine] = useState([]);

  useEffect(() => {
    api.get('/communities').then((d) => setMine(d.communities.filter((c) => c.joined))).catch(() => {});
  }, [user]);

  const submit = (e) => {
    e.preventDefault();
    if (q.trim().length >= 2) nav(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <div className="app-frame">
      <header className="topbar">
        <Brand subtitle />
        <form onSubmit={submit} className="search" role="search">
          <span className="search-glyph" aria-hidden="true">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations, people, communities…" aria-label="Search" />
          <kbd>↵</kbd>
        </form>
        <nav className="topnav">
          {user ? (
            <>
              <Link to="/submit" className="btn primary create-btn"><span>＋</span> Create post</Link>
              <Link to="/notifications" className="iconbtn notification-btn" aria-label="Notifications" title="Notifications">
                <span aria-hidden="true">♧</span>{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
              </Link>
              <Link to={`/u/${user.username}`} className="user-chip"><span className="user-avatar">{(user.display_name || user.username || 'N').slice(0, 1).toUpperCase()}</span><span className="user-chip-name">{user.display_name || user.username}</span><span className="user-chevron">⌄</span></Link>
              <button className="btn ghost sm logout-btn" onClick={() => { logout(); nav('/'); }}>Log out</button>
            </>
          ) : (
            <><Link to="/login" className="btn ghost sm">Log in</Link><Link to="/register" className="btn primary sm">Get started <span aria-hidden="true">↗</span></Link></>
          )}
        </nav>
      </header>

      <div className="shell">
        <aside className="side">
          <div className="side-label">YOUR SPACE</div>
          <nav className="side-nav" aria-label="Main navigation">
            {navItems.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}><span className="side-icon">{item.icon}</span><span>{item.label}</span>{item.label === 'Explore' && <span className="side-arrow">↗</span>}</NavLink>)}
            {user && <NavLink to="/notifications" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}><span className="side-icon">♧</span><span>Notifications</span>{unread > 0 && <span className="side-count">{unread > 99 ? '99+' : unread}</span>}</NavLink>}
            {isMod && <NavLink to="/moderation" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}><span className="side-icon">◈</span><span>Moderation</span></NavLink>}
            {isAdmin && <NavLink to="/admin" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}><span className="side-icon">⚙</span><span>Admin console</span></NavLink>}
          </nav>

          {user && mine.length > 0 && <>
            <div className="side-label community-label">YOUR COMMUNITIES <span>{mine.length}</span></div>
            <nav className="community-nav" aria-label="Your communities">
              {mine.slice(0, 7).map((c, i) => <NavLink key={c.name} to={`/c/${c.name}`} className={({ isActive }) => `community-link${isActive ? ' active' : ''}`}><span className={`community-dot dot-${i % 5}`}>{c.title?.slice(0, 1)?.toUpperCase() || 'C'}</span><span>c/{c.name}</span></NavLink>)}
              {mine.length > 7 && <Link to="/c" className="view-all">View all communities ↗</Link>}
            </nav>
          </>}

          <div className="sidebar-promo">
            <div className="promo-orbit">✳</div>
            <strong>Good things grow together.</strong>
            <p>Share what you know. Find your people.</p>
            {!user && <Link to="/register">Join your campus <span>↗</span></Link>}
          </div>
          <div className="side-footer"><span className="status-pip" /> Built for campus life <span className="footer-dot">·</span> v1.0</div>
        </aside>
        <main className="main"><Outlet /></main>
      </div>
    </div>
  );
}
