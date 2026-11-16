import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Author, TypeTag, timeAgo } from '../util.jsx';
import Media from './Media.jsx';

export function Vote({ type, id, score, myVote, disabled }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [s, setS] = useState({ score, my: myVote });
  useEffect(() => setS({ score, my: myVote }), [score, myVote]);
  const cast = async (v) => {
    if (!user) return nav('/login');
    const value = s.my === v ? 0 : v;
    try {
      const r = await api.post('/votes', { type, id, value });
      setS({ score: r.score, my: r.my_vote });
    } catch (e) { alert(e.message); }
  };
  return (
    <div className="vote">
      <button className={s.my === 1 ? 'on up' : ''} onClick={() => cast(1)} aria-label="Upvote" disabled={disabled}>▲</button>
      <span>{s.score}</span>
      <button className={s.my === -1 ? 'on down' : ''} onClick={() => cast(-1)} aria-label="Downvote" disabled={disabled}>▼</button>
    </div>
  );
}

export default function PostCard({ post }) {
  return (
    <article className={`card post ${post.pinned ? 'pinned' : ''}`}>
      <Vote type="post" id={post.id} score={post.score} myVote={post.my_vote} />
      <div className="postbody">
        <div className="meta">
          <Link to={`/c/${post.community.name}`} className="comm">c/{post.community.name}</Link>
          <span>·</span><Author author={post.author} /><span>·</span><span>{timeAgo(post.created_at)}</span>
          {post.pinned && <span className="tag pin">📌 Pinned</span>}
          {post.locked && <span className="tag">🔒 Locked</span>}
        </div>
        <h3><TypeTag type={post.type} /> <Link to={`/post/${post.id}`}>{post.title}</Link></h3>
        {post.body && <p className="snippet">{post.body.length > 220 ? post.body.slice(0, 220) + '…' : post.body}</p>}
        <Media media={post.media} compact />
        <div className="actions">
          <Link to={`/post/${post.id}`}>💬 {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}</Link>
          <button type="button" className="link" onClick={() => navigator.clipboard?.writeText(`${location.origin}/post/${post.id}`).then(() => alert('Link copied!')).catch(() => {})}>🔗 Share</button>
        </div>
      </div>
    </article>
  );
}

export function PostList({ posts, loading, empty = 'Nothing here yet.' }) {
  if (loading) return <div className="empty">Loading…</div>;
  if (!posts.length) return <div className="empty">{empty}</div>;
  return posts.map((p) => <PostCard key={p.id} post={p} />);
}
