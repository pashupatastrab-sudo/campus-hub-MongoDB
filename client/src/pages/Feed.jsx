import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PostList } from '../components/PostCard.jsx';

const SORTS = [['hot', 'Hot'], ['new', 'New'], ['top', 'Top'], ['discussed', 'Most discussed']];

export default function Feed({ mode }) {
  const { name } = useParams();
  const { user, isMod } = useAuth();
  const [sp, setSp] = useSearchParams();
  const sort = sp.get('sort') || (mode === 'community' ? 'hot' : 'hot');
  const type = sp.get('type') || '';
  const [posts, setPosts] = useState([]);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [community, setCommunity] = useState(null);
  const [error, setError] = useState('');

  const query = useCallback((p) => {
    const q = new URLSearchParams({ sort, page: p });
    if (type) q.set('type', type);
    if (mode === 'community') q.set('community', name);
    if (mode === 'home' && user) q.set('feed', 'home');
    return `/posts?${q}`;
  }, [sort, type, mode, name, user]);

  useEffect(() => {
    setLoading(true); setPage(1); setError('');
    api.get(query(1)).then((d) => { setPosts(d.posts); setMore(d.has_more); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [query]);

  useEffect(() => {
    if (mode !== 'community') { setCommunity(null); return; }
    api.get(`/communities/${name}`).then((d) => setCommunity(d.community)).catch((e) => setError(e.message));
  }, [mode, name, user]);

  const loadMore = async () => {
    const d = await api.get(query(page + 1));
    setPosts((p) => [...p, ...d.posts]); setMore(d.has_more); setPage(page + 1);
  };
  const toggleJoin = async () => {
    const d = await api.post(`/communities/${name}/${community.joined ? 'leave' : 'join'}`);
    setCommunity({ ...community, joined: d.joined, members: community.members + (d.joined ? 1 : -1) });
  };
  const setParam = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  if (mode === 'community' && error && !community) return <div className="empty">{error}</div>;

  return (
    <>
      {mode === 'community' && community && (
        <div className="card commhead">
          <div>
            <h1>{community.title}</h1>
            <div className="muted">c/{community.name} · {community.kind} · {community.members} member{community.members === 1 ? '' : 's'}</div>
            {community.description && <p>{community.description}</p>}
          </div>
          <div className="stack">
            {user && <button className={`btn ${community.joined ? 'ghost' : 'primary'}`} onClick={toggleJoin}>{community.joined ? 'Joined ✓' : 'Join'}</button>}
            {user && <Link className="btn ghost" to={`/submit?community=${community.name}`}>Post here</Link>}
          </div>
        </div>
      )}
      {mode === 'home' && !user && (
        <div className="card hero">
          <h1>Your campus, in one place.</h1>
          <p>Ask questions, share notes, follow course communities and hear from your teachers.</p>
          <div><Link to="/register" className="btn primary">Join Campus Hub</Link> <Link to="/login" className="btn ghost">Log in</Link></div>
        </div>
      )}
      {mode === 'home' && user && <h2 className="pagehead">Your feed</h2>}
      {mode === 'all' && <h2 className="pagehead">All posts</h2>}
      <div className="toolbar">
        <div className="pills">{SORTS.map(([k, l]) => <button key={k} className={sort === k ? 'active' : ''} onClick={() => setParam('sort', k === 'hot' ? '' : k)}>{l}</button>)}</div>
        <select value={type} onChange={(e) => setParam('type', e.target.value)} aria-label="Filter by type">
          <option value="">All types</option><option value="question">Questions</option><option value="resource">Resources</option>
          <option value="announcement">Announcements</option><option value="discussion">Discussions</option>
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      <PostList posts={posts} loading={loading} empty={mode === 'home' && user ? 'No posts yet — join some communities or start a conversation.' : 'No posts yet. Be the first!'} />
      {more && <button className="btn ghost wide" onClick={loadMore}>Load more</button>}
      {isMod && null}
    </>
  );
}
