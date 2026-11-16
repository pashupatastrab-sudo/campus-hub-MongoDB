import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { PostList } from '../components/PostCard.jsx';

export default function Search() {
  const [sp] = useSearchParams();
  const q = sp.get('q') || '';
  const [r, setR] = useState(null);
  useEffect(() => { setR(null); api.get(`/search?q=${encodeURIComponent(q)}`).then(setR); }, [q]);
  if (!r) return <div className="empty">Searching…</div>;
  const none = !r.posts.length && !r.communities.length && !r.users.length;
  return (
    <>
      <h2 className="pagehead">Results for “{q}”</h2>
      {none && <div className="empty">No results. Try a different keyword.</div>}
      {r.communities.length > 0 && (<><h4 className="sect">Communities</h4>
        {r.communities.map((c) => <div key={c.name} className="card slim"><Link to={`/c/${c.name}`}><strong>{c.title}</strong></Link> <span className="muted">c/{c.name}</span><div className="muted">{c.description}</div></div>)}</>)}
      {r.users.length > 0 && (<><h4 className="sect">People</h4>
        {r.users.map((u) => <div key={u.id} className="card slim"><Link to={`/u/${u.username}`}><strong>{u.display_name}</strong></Link> <span className="muted">@{u.username} · {u.role}</span></div>)}</>)}
      {r.posts.length > 0 && (<><h4 className="sect">Posts</h4><PostList posts={r.posts} /></>)}
    </>
  );
}
