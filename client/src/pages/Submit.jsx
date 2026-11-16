import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { fmtSize } from '../util.jsx';

const MAX_FILES = 10;

export default function Submit() {
  const { isMod } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [communities, setCommunities] = useState([]);
  const [f, setF] = useState({ community: sp.get('community') || '', title: '', body: '', type: 'discussion' });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef();
  const filesRef = useRef([]);
  const posted = useRef(false);
  filesRef.current = files;

  useEffect(() => {
    api.get('/communities').then((d) => {
      setCommunities(d.communities);
      setF((x) => (x.community ? x : { ...x, community: d.communities.find((c) => c.joined)?.name || d.communities[0]?.name || '' }));
    });
  }, []);

  // Leaving the page without posting: discard uploads that never got attached.
  useEffect(() => () => {
    if (!posted.current) filesRef.current.forEach((x) => api.del(`/uploads/${x.id}`).catch(() => {}));
  }, []);

  const addFiles = async (list) => {
    const chosen = [...list];
    if (!chosen.length) return;
    setErr('');
    let count = filesRef.current.length;
    for (const file of chosen) {
      if (count >= MAX_FILES) { setErr(`Maximum ${MAX_FILES} files per post.`); break; }
      setUploading((n) => n + 1);
      try {
        const r = await api.upload(file);
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
        setFiles((x) => [...x, { ...r, preview }]);
        count += 1;
      } catch (x) { setErr(`${file.name}: ${x.message}`); }
      setUploading((n) => n - 1);
    }
  };

  const pick = (e) => { addFiles(e.target.files); e.target.value = ''; };
  const onDrop = (e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); };
  const onPaste = (e) => {
    const imgs = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/'));
    if (imgs.length) { e.preventDefault(); addFiles(imgs.map((x, i) => (x.name && x.name !== 'image.png' ? x : new File([x], `pasted-${Date.now()}-${i}.png`, { type: x.type })))); }
  };
  const remove = (x) => {
    setFiles((l) => l.filter((y) => y.id !== x.id));
    if (x.preview) URL.revokeObjectURL(x.preview);
    api.del(`/uploads/${x.id}`).catch(() => {});
  };

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const d = await api.post('/posts', { ...f, attachments: files.map((x) => x.id) });
      posted.current = true;
      nav(`/post/${d.id}`);
    } catch (x) { setErr(x.message); setBusy(false); }
  };

  const types = [['discussion', 'Discussion'], ['question', 'Question'], ['resource', 'Resource / notes'], ...(isMod ? [['announcement', 'Announcement']] : [])];

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Create a post</h2>
      <div className="row2">
        <label>Community<select value={f.community} onChange={(e) => setF({ ...f, community: e.target.value })} required>
          {communities.map((c) => <option key={c.id} value={c.name}>c/{c.name} — {c.title}</option>)}
        </select></label>
        <label>Type<select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
      </div>
      <label>Title<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} required minLength={3} /></label>
      <label>Details<textarea rows={7} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} onPaste={onPaste} maxLength={20000} placeholder="Write something helpful… (you can paste screenshots here)" /></label>

      <div
        className={`dropzone ${drag ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <div className="dz-text">
          <strong>Drag &amp; drop images, videos or files here</strong>
          <span className="muted"> or </span>
          <button type="button" className="btn ghost sm" onClick={() => input.current.click()}>📎 Browse</button>
          <input ref={input} type="file" multiple hidden onChange={pick} />
          <div className="muted small">Images · video · PDF · Office docs · zip — up to 25 MB each, {MAX_FILES} per post</div>
        </div>
        {(files.length > 0 || uploading > 0) && (
          <ul className="thumbs">
            {files.map((x) => (
              <li key={x.id} className="thumb">
                {x.preview ? <img src={x.preview} alt={x.filename} /> : <span className="thumb-ico">{x.mime.startsWith('video/') ? '🎬' : '📄'}</span>}
                <span className="thumb-name" title={x.filename}>{x.filename}</span>
                <span className="muted small">{fmtSize(x.size)}</span>
                <button type="button" className="thumb-x" onClick={() => remove(x)} aria-label={`Remove ${x.filename}`}>✕</button>
              </li>
            ))}
            {Array.from({ length: uploading }).map((_, i) => <li key={`u${i}`} className="thumb uploading"><span className="spinner" /> Uploading…</li>)}
          </ul>
        )}
      </div>

      {err && <div className="error">{err}</div>}
      <button className="btn primary" disabled={busy || uploading > 0}>{busy ? 'Posting…' : uploading ? 'Uploading…' : 'Post'}</button>
    </form>
  );
}
