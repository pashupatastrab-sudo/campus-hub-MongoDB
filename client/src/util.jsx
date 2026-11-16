import { Link } from 'react-router-dom';

export function timeAgo(s) {
  const d = new Date(s); // ISO string from the API
  const sec = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  const units = [['y', 31536000], ['mo', 2592000], ['d', 86400], ['h', 3600], ['m', 60]];
  for (const [u, n] of units) if (sec >= n) return `${Math.floor(sec / n)}${u} ago`;
  return 'just now';
}

export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function Author({ author }) {
  return (
    <span className="author">
      <Link to={`/u/${author.username}`}>{author.display_name}</Link>
      {author.role === 'admin' && <span className="badge admin">Admin</span>}
      {author.verified_teacher && author.role !== 'admin' && <span className="badge teacher">Teacher</span>}
    </span>
  );
}

const TYPE_LABEL = { question: 'Question', resource: 'Resource', announcement: 'Announcement' };
export const TypeTag = ({ type }) => (TYPE_LABEL[type] ? <span className={`tag ${type}`}>{TYPE_LABEL[type]}</span> : null);

const URL_RE = /(https?:\/\/[^\s<]+)/g;
export function RichText({ text }) {
  return (
    <div className="richtext">
      {String(text).split(URL_RE).map((part, i) =>
        i % 2 ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a> : part,
      )}
    </div>
  );
}
