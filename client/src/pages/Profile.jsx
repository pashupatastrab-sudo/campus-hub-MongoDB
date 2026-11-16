import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PostList } from '../components/PostCard.jsx';
import { timeAgo } from '../util.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user, refresh } = useAuth();
  const [data, setData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(null);
  const [pw, setPw] = useState(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    api.get(`/users/${username}`).then(setData).catch((e) => setErr(e.message));
    api.get(`/posts?author=${username}&sort=new`).then((d) => setPosts(d.posts));
  };
  useEffect(() => { setData(null); setErr(''); load(); }, [username]);

  if (err) return <div className="empty">{err}</div>;
  if (!data) return <div className="empty">Loading…</div>;
  const u = data.user;
  const mine = user?.id === u.id;
  const save = async (e) => {
    e.preventDefault();
    try { await api.patch('/auth/me', edit); setEdit(null); refresh(); load(); } catch (x) { setMsg(x.message); }
  };
  const changePw = async (e) => {
    e.preventDefault();
    try { await api.post('/auth/password', pw); setPw(null); setMsg('Password updated.'); } catch (x) { setMsg(x.message); }
  };

  return (
    <>
      <div className="card profile">
        <div className="avatar">{u.display_name[0]?.toUpperCase()}</div>
        <div>
          <h1>{u.display_name} {u.role === 'admin' && <span className="badge admin">Admin</span>}{u.verified_teacher && u.role !== 'admin' && <span className="badge teacher">Teacher</span>}
            {u.teacher_status === 'pending' && mine && <span className="badge pending">Teacher – awaiting verification</span>}</h1>
          <div className="muted">@{u.username}{u.department && ` · ${u.department}`} · joined {timeAgo(u.created_at)}</div>
          {u.bio && <p>{u.bio}</p>}
          <div className="stats"><span><b>{data.stats.posts}</b> posts</span><span><b>{data.stats.comments}</b> comments</span><span><b>{data.stats.karma}</b> karma</span></div>
          {mine && !edit && <p><button className="btn ghost sm" onClick={() => setEdit({ display_name: u.display_name, bio: u.bio, department: u.department })}>Edit profile</button> <button className="btn ghost sm" onClick={() => setPw({ current: '', next: '' })}>Change password</button></p>}
        </div>
      </div>
      {msg && <div className="note">{msg}</div>}
      {edit && (
        <form className="card form" onSubmit={save}>
          <label>Display name<input value={edit.display_name} onChange={(e) => setEdit({ ...edit, display_name: e.target.value })} required /></label>
          <label>Department<input value={edit.department} onChange={(e) => setEdit({ ...edit, department: e.target.value })} /></label>
          <label>Bio<textarea rows={3} maxLength={300} value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} /></label>
          <div><button className="btn primary sm">Save</button> <button type="button" className="btn ghost sm" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
      {pw && (
        <form className="card form" onSubmit={changePw}>
          <label>Current password<input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></label>
          <label>New password<input type="password" minLength={3} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></label>
          <div><button className="btn primary sm">Update</button> <button type="button" className="btn ghost sm" onClick={() => setPw(null)}>Cancel</button></div>
        </form>
      )}
      <h4 className="sect">Posts</h4>
      <PostList posts={posts} empty="No posts yet." />
    </>
  );
}
