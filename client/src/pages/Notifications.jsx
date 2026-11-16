import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { timeAgo } from '../util.jsx';

export default function Notifications() {
  const { setUnread } = useAuth();
  const [items, setItems] = useState(null);
  const load = () => api.get('/notifications').then((d) => setItems(d.notifications));
  useEffect(() => { load(); }, []);

  const markAll = async () => { await api.post('/notifications/read', {}); setUnread(0); load(); };
  const markOne = async (n) => {
    if (n.read) return;
    await api.post('/notifications/read', { ids: [n.id] });
    setUnread((u) => Math.max(0, u - 1));
  };

  if (!items) return <div className="empty">Loading…</div>;
  return (
    <>
      <div className="toolbar"><h2 className="pagehead">Notifications</h2>
        {items.some((n) => !n.read) && <button className="btn ghost sm" onClick={markAll}>Mark all read</button>}</div>
      {!items.length && <div className="empty">You're all caught up.</div>}
      {items.map((n) => (
        <div key={n.id} className={`card slim notif ${n.read ? '' : 'unread'}`}>
          {n.post_id ? <Link to={`/post/${n.post_id}`} onClick={() => markOne(n)}>{n.message}</Link> : <span>{n.message}</span>}
          <span className="muted"> · {timeAgo(n.created_at)}</span>
        </div>
      ))}
    </>
  );
}
