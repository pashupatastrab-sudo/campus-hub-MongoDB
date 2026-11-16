import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Communities() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [kind, setKind] = useState('');
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ name: '', title: '', description: '', kind: 'course' });
  const [err, setErr] = useState('');

  const load = () => api.get('/communities').then((d) => setList(d.communities));
  useEffect(() => { load(); }, [user]);

  const create = async (e) => {
    e.preventDefault(); setErr('');
    try { const d = await api.post('/communities', f); nav(`/c/${d.community.name}`); }
    catch (x) { setErr(x.message); }
  };
  const toggle = async (c) => {
    await api.post(`/communities/${c.name}/${c.joined ? 'leave' : 'join'}`); load();
  };
  const shown = list.filter((c) => !kind || c.kind === kind);

  return (
    <>
      <div className="toolbar">
        <h2 className="pagehead">Communities</h2>
        {user && <button className="btn primary sm" onClick={() => setShow(!show)}>{show ? 'Cancel' : '+ Create community'}</button>}
      </div>
      {show && (
        <form className="card form" onSubmit={create}>
          <div className="row2">
            <label>Name (URL)<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value.toLowerCase() })} placeholder="cs201-algorithms" required minLength={3} maxLength={30} /></label>
            <label>Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="CS201 – Algorithms" required /></label>
          </div>
          <label>Description<textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} /></label>
          <label>Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            <option value="course">Course</option><option value="department">Department</option><option value="club">Club</option><option value="general">General</option>
          </select></label>
          {err && <div className="error">{err}</div>}
          <button className="btn primary">Create</button>
        </form>
      )}
      <div className="pills spaced">
        {[['', 'All'], ['course', 'Courses'], ['department', 'Departments'], ['club', 'Clubs'], ['general', 'General']].map(([k, l]) => (
          <button key={k} className={kind === k ? 'active' : ''} onClick={() => setKind(k)}>{l}</button>
        ))}
      </div>
      <div className="grid">
        {shown.map((c) => (
          <div key={c.id} className="card comm-card">
            <Link to={`/c/${c.name}`}><strong>{c.title}</strong></Link>
            <div className="muted">c/{c.name} · {c.kind}</div>
            <p>{c.description || 'No description yet.'}</p>
            <div className="between">
              <span className="muted">{c.members} members · {c.post_count} posts</span>
              {user && <button className={`btn sm ${c.joined ? 'ghost' : 'primary'}`} onClick={() => toggle(c)}>{c.joined ? 'Leave' : 'Join'}</button>}
            </div>
          </div>
        ))}
      </div>
      {!shown.length && <div className="empty">No communities here yet.</div>}
    </>
  );
}
