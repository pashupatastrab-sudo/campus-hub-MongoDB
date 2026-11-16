import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { timeAgo } from '../util.jsx';

export default function Moderation() {
  const [status, setStatus] = useState('open');
  const [items, setItems] = useState(null);
  const load = () => api.get(`/reports?status=${status}`).then((d) => setItems(d.reports));
  useEffect(() => { setItems(null); load(); }, [status]);
  const resolve = async (id, action) => { await api.post(`/reports/${id}/resolve`, { action }); load(); };

  return (
    <>
      <h2 className="pagehead">Moderation queue</h2>
      <div className="pills spaced">{[['open', 'Open'], ['actioned', 'Removed'], ['dismissed', 'Dismissed']].map(([k, l]) => <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>)}</div>
      {!items ? <div className="empty">Loading…</div> : !items.length ? <div className="empty">No {status} reports.</div> : items.map((r) => (
        <div key={r.id} className="card slim report">
          <div className="muted">Reported {r.type} by @{r.reporter} · {timeAgo(r.created_at)}</div>
          <div className="quote">{r.target ? <><Link to={`/post/${r.target.post_id}`}>{String(r.target.text).slice(0, 200)}</Link> <span className="muted">— @{r.target.author}{r.target.removed ? ' (removed)' : ''}</span></> : <em>Content no longer exists</em>}</div>
          <div><b>Reason:</b> {r.reason}</div>
          {r.status === 'open' && <div className="stack-h"><button className="btn sm danger" onClick={() => resolve(r.id, 'remove')}>Remove content</button><button className="btn sm ghost" onClick={() => resolve(r.id, 'dismiss')}>Dismiss</button></div>}
        </div>
      ))}
    </>
  );
}
