import { useCallback, useEffect, useState } from 'react';
import { fmtSize } from '../util.jsx';

export const isImage = (m) => m.mime.startsWith('image/');
export const isVideo = (m) => m.mime.startsWith('video/');
export const isAudio = (m) => m.mime.startsWith('audio/');

const FILE_ICON = (m) =>
  m.mime === 'application/pdf' ? '📕' : /zip/.test(m.mime) ? '🗜️' : /sheet|excel|csv/.test(m.mime) ? '📊' : /presentation|powerpoint/.test(m.mime) ? '📽️' : /word|msword/.test(m.mime) ? '📝' : '📄';

/** Full-screen image viewer with keyboard (←/→/Esc) support. */
export function Lightbox({ images, start = 0, onClose }) {
  const [i, setI] = useState(start);
  const n = images.length;
  const go = useCallback((d) => setI((x) => (x + d + n) % n), [n]);
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && n > 1) go(1);
      else if (e.key === 'ArrowLeft' && n > 1) go(-1);
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [go, n, onClose]);
  const m = images[i];
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label="Image viewer">
      <button className="lb-close" onClick={onClose} aria-label="Close">✕</button>
      {n > 1 && <button className="lb-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Previous">‹</button>}
      <img src={m.url} alt={m.filename} onClick={(e) => e.stopPropagation()} />
      {n > 1 && <button className="lb-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Next">›</button>}
      <div className="lb-cap" onClick={(e) => e.stopPropagation()}>
        {m.filename}{n > 1 && ` · ${i + 1} / ${n}`} · <a href={m.url} download={m.filename}>Download</a>
      </div>
    </div>
  );
}

function Img({ m, onOpen, className = '' }) {
  const [state, setState] = useState('loading');
  return (
    <button type="button" className={`img-tile ${state} ${className}`} onClick={onOpen} aria-label={`Open ${m.filename}`}>
      {state === 'error' ? <span className="img-fail">⚠ Image failed to load</span> : (
        <img src={m.url} alt={m.filename} loading="lazy" onLoad={() => setState('ok')} onError={() => setState('error')} />
      )}
    </button>
  );
}

/**
 * Reddit-style media block.
 *  - compact (feed card): one big image, or a 2/3/4-up grid with "+N"; inline video; file chips.
 *  - full (post page): every image at full width, video players, file list.
 */
export default function Media({ media = [], compact = false }) {
  const [open, setOpen] = useState(null);
  const images = media.filter(isImage);
  const videos = media.filter(isVideo);
  const audios = media.filter(isAudio);
  const files = media.filter((m) => !isImage(m) && !isVideo(m) && !isAudio(m));
  if (!media.length) return null;

  const shown = compact ? images.slice(0, 4) : images;
  const extra = compact ? images.length - shown.length : 0;

  return (
    <div className={`media ${compact ? 'compact' : 'full'}`}>
      {shown.length > 0 && (
        <div className={`media-images n${Math.min(shown.length, 4)} ${compact ? '' : 'stack'}`}>
          {shown.map((m, idx) => (
            <div key={m.id} className="img-wrap">
              <Img m={m} onOpen={() => setOpen(idx)} />
              {extra > 0 && idx === shown.length - 1 && <span className="more-badge" onClick={() => setOpen(idx)}>+{extra}</span>}
            </div>
          ))}
        </div>
      )}
      {videos.slice(0, compact ? 1 : 20).map((m) => (
        <video key={m.id} className="media-video" src={m.url} controls preload="metadata" playsInline />
      ))}
      {audios.map((m) => (
        <audio key={m.id} className="media-audio" src={m.url} controls preload="none" />
      ))}
      {files.length > 0 && (
        <div className="file-chips">
          {files.map((m) => (
            <a key={m.id} className="file-chip" href={m.url} target="_blank" rel="noopener noreferrer" download={m.filename} onClick={(e) => e.stopPropagation()}>
              <span className="fc-ico">{FILE_ICON(m)}</span>
              <span className="fc-name">{m.filename}</span>
              <span className="muted fc-size">{fmtSize(m.size)}</span>
            </a>
          ))}
        </div>
      )}
      {open !== null && <Lightbox images={images} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
