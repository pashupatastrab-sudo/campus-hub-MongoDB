import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Vote } from '../components/PostCard.jsx';
import { Author, RichText, TypeTag, timeAgo } from '../util.jsx';
import Media from '../components/Media.jsx';

async function report(type, id) {
  const reason = prompt('What is wrong with this content? (visible to moderators)');
  if (!reason) return;
  try { await api.post('/reports', { type, id, reason }); alert('Thanks — moderators will review it.'); }
  catch (e) { alert(e.message); }
}

function Composer({ postId, parentId, onDone, onCancel, autoFocus }) {
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { await api.post(`/posts/${postId}/comments`, { body, parent_id: parentId }); setBody(''); onDone(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={send} className="composer">
      <textarea rows={parentId ? 3 : 4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" maxLength={10000} required autoFocus={autoFocus} />
      {err && <div className="error">{err}</div>}
      <div>
        <button className="btn primary sm" disabled={busy || !body.trim()}>{busy ? 'Sending…' : 'Comment'}</button>
        {onCancel && <button type="button" className="btn ghost sm" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function Comment({ c, tree, post, reload, depth }) {
  const { user, isMod } = useAuth();
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const kids = tree[c.id] || [];
  const act = async (fn) => { try { await fn(); reload(); } catch (e) { alert(e.message); } };
  return (
    <div className={`comment ${c.endorsed ? 'endorsed' : ''}`}>
      <div className="cmeta">
        <button className="link" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle thread">{collapsed ? '[+]' : '[–]'}</button>
        <Author author={c.author} /> · <span className="muted">{timeAgo(c.created_at)}</span>
        {c.endorsed && <span className="tag endorse">✔ Endorsed by teacher</span>}
      </div>
      {!collapsed && (
        <>
          <div className={c.removed ? 'removed' : ''}><RichText text={c.body} />{c.removed && isMod && <em className="muted"> (removed – visible to moderators)</em>}</div>
          <div className="cactions">
            {!c.removed && <Vote type="comment" id={c.id} score={c.score} myVote={c.my_vote} />}
            {user && !post.locked && !c.removed && <button className="link" onClick={() => setReplying(!replying)}>Reply</button>}
            {isMod && !c.removed && <button className="link" onClick={() => act(() => api.post(`/comments/${c.id}/endorse`))}>{c.endorsed ? 'Un-endorse' : 'Endorse'}</button>}
            {c.can_delete && !c.removed && <button className="link" onClick={() => confirm('Delete this comment?') && act(() => api.del(`/comments/${c.id}`))}>Delete</button>}
            {isMod && c.removed && <button className="link" onClick={() => act(() => api.post(`/comments/${c.id}/restore`))}>Restore</button>}
            {user && !c.removed && <button className="link" onClick={() => report('comment', c.id)}>Report</button>}
          </div>
          {replying && <Composer postId={post.id} parentId={c.id} autoFocus onCancel={() => setReplying(false)} onDone={() => { setReplying(false); reload(); }} />}
          {kids.length > 0 && (
            <div className={`children ${depth >= 6 ? 'flat' : ''}`}>
              {kids.map((k) => <Comment key={k.id} c={k} tree={tree} post={post} reload={reload} depth={depth + 1} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PostPage() {
  const { id } = useParams();
  const { user, isMod } = useAuth();
  const nav = useNavigate();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const loadComments = useCallback(() => api.get(`/posts/${id}/comments`).then((d) => setComments(d.comments)), [id]);
  const loadPost = useCallback(() => api.get(`/posts/${id}`).then((d) => setPost(d.post)).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { setPost(null); setErr(''); loadPost(); loadComments(); }, [id, user, loadPost, loadComments]);

  const tree = useMemo(() => {
    const t = {};
    for (const c of comments) (t[c.parent_id ?? 0] ||= []).push(c);
    // endorsed first, then best score
    for (const k of Object.keys(t)) t[k].sort((a, b) => b.endorsed - a.endorsed || b.score - a.score);
    return t;
  }, [comments]);

  if (err) return <div className="empty">{err}</div>;
  if (!post) return <div className="empty">Loading…</div>;

  const run = async (fn, after) => { try { await fn(); after ? after() : loadPost(); } catch (e) { alert(e.message); } };
  const saveEdit = () => run(() => api.patch(`/posts/${post.id}`, { body: editing, title: editTitle }), () => { setEditing(null); loadPost(); });

  return (
    <>
      <article className="card post single">
        <Vote type="post" id={post.id} score={post.score} myVote={post.my_vote} />
        <div className="postbody">
          <div className="meta">
            <Link to={`/c/${post.community.name}`} className="comm">c/{post.community.name}</Link><span>·</span>
            <Author author={post.author} /><span>·</span><span>{timeAgo(post.created_at)}</span>
            {post.pinned && <span className="tag pin">📌 Pinned</span>}
            {post.locked && <span className="tag">🔒 Locked</span>}
            {post.removed && <span className="tag danger">Removed</span>}
          </div>
          {editing !== null ? <input className="title-edit" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={200} aria-label="Title" /> : <h1><TypeTag type={post.type} /> {post.title}</h1>}
          {editing !== null ? (
            <div className="form">
              <textarea rows={8} value={editing} onChange={(e) => setEditing(e.target.value)} maxLength={20000} />
              <div><button className="btn primary sm" onClick={saveEdit}>Save</button> <button className="btn ghost sm" onClick={() => setEditing(null)}>Cancel</button></div>
            </div>
          ) : post.body && <RichText text={post.body} />}

          <Media media={post.attachments || []} />

          <div className="actions">
            <span>💬 {post.comment_count}</span>
            {post.can_edit && editing === null && <button className="link" onClick={() => { setEditing(post.body); setEditTitle(post.title); }}>Edit</button>}
            {(post.can_edit || isMod) && (
              <button className="link" onClick={() => confirm(post.can_edit ? 'Delete this post permanently?' : 'Remove this post?') && run(() => api.del(`/posts/${post.id}`), () => (post.can_edit ? nav(`/c/${post.community.name}`) : loadPost()))}>
                {post.can_edit ? 'Delete' : 'Remove'}
              </button>
            )}
            {isMod && post.removed && <button className="link" onClick={() => run(() => api.post(`/posts/${post.id}/restore`))}>Restore</button>}
            {isMod && <button className="link" onClick={() => run(() => api.post(`/posts/${post.id}/pin`))}>{post.pinned ? 'Unpin' : 'Pin'}</button>}
            {isMod && <button className="link" onClick={() => run(() => api.post(`/posts/${post.id}/lock`))}>{post.locked ? 'Unlock' : 'Lock'}</button>}
            {user && !post.can_edit && <button className="link" onClick={() => report('post', post.id)}>Report</button>}
          </div>
        </div>
      </article>

      {user ? (
        post.locked && !isMod ? <div className="note">🔒 This thread is locked.</div> : <Composer postId={post.id} onDone={() => { loadComments(); loadPost(); }} />
      ) : (
        <div className="note"><Link to="/login" state={{ from: `/post/${post.id}` }}>Log in</Link> to join the discussion.</div>
      )}
      <div className="comments">
        {(tree[0] || []).map((c) => <Comment key={c.id} c={c} tree={tree} post={post} reload={() => { loadComments(); loadPost(); }} depth={0} />)}
        {!comments.length && <div className="empty">No comments yet.</div>}
      </div>
    </>
  );
}
