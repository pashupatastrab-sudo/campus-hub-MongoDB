import { Link } from 'react-router-dom';

export function BrandMark({ small = false }) {
  return (
    <span className={`brand-mark${small ? ' brand-mark-small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" role="img">
        <defs>
          <linearGradient id="campus-hub-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9AF5D5" />
            <stop offset="100%" stopColor="#4CE0B3" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="46" height="46" rx="15" fill="#142B32" />
        <path d="M12 31V17.5c0-1.1 1.3-1.7 2.2-1l18 14.8c.8.7 2 .1 2-1V17" fill="none" stroke="url(#campus-hub-gradient)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="35.5" cy="12.5" r="3" fill="#F6C96A" />
      </svg>
    </span>
  );
}

export default function Brand({ to = '/', centered = false, subtitle = false }) {
  return (
    <Link to={to} className={`brand${centered ? ' brand-centered' : ''}`} aria-label="Campus Hub home">
      <BrandMark />
      <span className="brand-copy"><strong>Campus Hub</strong>{subtitle && <small>YOUR CAMPUS, CONNECTED</small>}</span>
    </Link>
  );
}
