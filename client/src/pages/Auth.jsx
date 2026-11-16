import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Brand from '../components/Brand.jsx';

function Shell({ title, children, footer }) {
  return (
    <div className="authwrap">
      <div className="auth-aside"><Brand subtitle /><div className="auth-art"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-spark">✳</div><div className="auth-art-copy"><span className="eyebrow">A BETTER CAMPUS STARTS HERE</span><h1>Find your people.<br/><em>Grow together.</em></h1><p>One thoughtful space for ideas, study groups, campus updates and the conversations in between.</p><div className="auth-proof"><span className="proof-avatars"><i>S</i><i>A</i><i>R</i><i>+</i></span><span>Made for your campus community</span></div></div></div><div className="auth-aside-foot">A little closer, every day. <span>✦</span></div></div>
      <div className="auth-main"><div className="card authcard">
        <Brand centered subtitle />
        <h2>{title}</h2>
        {children}
        <p className="muted center">{footer}</p>
      </div></div>
    </div>
  );
}

const DEMO = [['admin', 'Admin'], ['prof_rao', 'Teacher'], ['asha', 'Student'], ['ravi', 'Student']];

export function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [f, setF] = useState({ identifier: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await login(f.identifier, f.password); nav(loc.state?.from || '/', { replace: true }); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Shell title="Welcome back" footer={<>New here? <Link to="/register">Create an account</Link></>}>
      <form onSubmit={go} className="form">
        <label>Email or username<input value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} autoFocus required autoComplete="username" /></label>
        <label>Password<input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="current-password" /></label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
        <div className="demo-box">
          <small className="muted">Demo accounts (password: password123) — click to fill</small>
          <div className="demo-chips">
            {DEMO.map(([u, r]) => <button type="button" key={u} className="chip" onClick={() => setF({ identifier: u, password: 'password123' })}>{u} <em>{r}</em></button>)}
          </div>
        </div>
      </form>
    </Shell>
  );
}

export function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', username: '', display_name: '', password: '', department: '', role: 'student' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const go = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await register(f); nav('/', { replace: true }); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <Shell title="Join your campus" footer={<>Already have an account? <Link to="/login">Log in</Link></>}>
      <form onSubmit={go} className="form">
        <div className="seg" role="radiogroup" aria-label="I am a">
          {['student', 'teacher'].map((r) => (
            <button type="button" key={r} className={f.role === r ? 'active' : ''} onClick={() => setF({ ...f, role: r })}>
              {r === 'student' ? '🎓 Student' : '🧑‍🏫 Teacher'}
            </button>
          ))}
        </div>
        {f.role === 'teacher' && <div className="note">Teacher accounts are verified by an admin before moderation tools unlock. You can use the site as a regular member meanwhile.</div>}
        <label>College email<input type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></label>
        <div className="row2">
          <label>Username<input value={f.username} onChange={set('username')} required minLength={3} maxLength={24} autoComplete="username" /></label>
          <label>Display name<input value={f.display_name} onChange={set('display_name')} maxLength={60} placeholder="Optional" /></label>
        </div>
        <label>Department<input value={f.department} onChange={set('department')} maxLength={80} placeholder="e.g. Computer Science" /></label>
        <label>Password<input type="password" value={f.password} onChange={set('password')} required minLength={3} autoComplete="new-password" /><small>Any password (3+ characters) — demo only</small></label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
      </form>
    </Shell>
  );
}
