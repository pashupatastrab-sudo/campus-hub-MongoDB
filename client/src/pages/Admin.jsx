import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtSize } from '../util.jsx';

export default function Admin() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    api.get('/admin/stats').then(setStats);
    api.get(`/admin/users?filter=${filter}&q=${encodeURIComponent(q)}`).then((d) => setUsers(d.users));
  };
  useEffect(() => { load(); }, [filter]);

  const patch = async (id, body) => { try { await api.patch(`/admin/users/${id}`, body); load(); } catch (e) { alert(e.message); } };

  return (
    <>
      <h2 className="pagehead">Admin</h2>
      {stats && (
        <div className="grid stats4">
          {[['Users', stats.users], ['Pending teachers', stats.pending_teachers], ['Posts', stats.posts], ['Comments', stats.comments], ['Communities', stats.communities], ['Open reports', stats.open_reports], ['Files', stats.files], [`Storage (${stats.storage_driver})`, fmtSize(stats.storage_bytes)]].map(([l, v]) => (
            <div key={l} className="card stat"><div className="num">{v}</div><div className="muted">{l}</div></div>
          ))}
        </div>
      )}
      <div className="toolbar">
        <div className="pills">{[['', 'All users'], ['pending', 'Pending teachers'], ['banned', 'Banned']].map(([k, l]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
        <form onSubmit={(e) => { e.preventDefault(); load(); }}><input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} /></form>
      </div>
      <div className="card tablewrap">
        <table>
          <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.banned ? 'dim' : ''}>
                <td><Link to={`/u/${u.username}`}>{u.display_name}</Link><div className="muted">@{u.username}</div></td>
                <td>{u.email}</td>
                <td>{u.role}{u.teacher_status === 'pending' && <span className="badge pending">pending</span>}</td>
                <td className="stack-h">
                  {u.teacher_status === 'pending' && <button className="btn sm primary" onClick={() => patch(u.id, { teacher_status: 'approved' })}>Approve teacher</button>}
                  {u.teacher_status === 'pending' && <button className="btn sm ghost" onClick={() => patch(u.id, { role: 'student' })}>Reject</button>}
                  {u.id !== user.id && (
                    <select value={u.role} onChange={(e) => patch(u.id, { role: e.target.value })} aria-label="Change role">
                      <option value="student">student</option><option value="teacher">teacher</option><option value="admin">admin</option>
                    </select>
                  )}
                  {u.id !== user.id && <button className={`btn sm ${u.banned ? 'ghost' : 'danger'}`} onClick={() => patch(u.id, { banned: !u.banned })}>{u.banned ? 'Unban' : 'Ban'}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
