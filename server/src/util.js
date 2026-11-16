import mongoose from 'mongoose';
import { Notification } from './db.js';

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Always coerces to a trimmed string, so a JSON/query-string object can never reach a MongoDB filter (NoSQL injection). */
export const str = (v, max, { min = 0, name = 'Field' } = {}) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min) throw new HttpError(400, `${name} must be at least ${min} character${min === 1 ? '' : 's'}.`);
  if (s.length > max) throw new HttpError(400, `${name} must be at most ${max} characters.`);
  return s;
};

const OID_RE = /^[0-9a-f]{24}$/i;
/** ObjectId from a request value, or null when it is not a valid 24-hex id string. */
export const toId = (v) => {
  if (v instanceof mongoose.Types.ObjectId) return v;
  return typeof v === 'string' && OID_RE.test(v) ? new mongoose.Types.ObjectId(v) : null;
};
export const needId = (v, msg = 'Not found.') => {
  const id = toId(v);
  if (!id) throw new HttpError(404, msg);
  return id;
};
/** String id of a document (lean or hydrated) or ObjectId. */
export const idOf = (x) => String(x?._id ?? x?.id ?? x);

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Creates a notification. Never throws: a failed notification must not fail the request. */
export async function notify({ userId, type, actorId, postId = null, commentId = null, message }) {
  if (!userId || String(userId) === String(actorId)) return;
  try {
    await Notification.create({ user: userId, type, actor: actorId ?? null, post: postId, comment: commentId, message });
  } catch (e) {
    console.warn('[notify] failed:', e.message);
  }
}

export async function notifyMany(userIds, { type, actorId, postId = null, message }) {
  const docs = userIds.filter((u) => String(u) !== String(actorId)).map((u) => ({ user: u, type, actor: actorId ?? null, post: postId, message }));
  if (!docs.length) return;
  try {
    await Notification.insertMany(docs, { ordered: false });
  } catch (e) {
    console.warn('[notify] failed:', e.message);
  }
}

export const paginate = (req, def = 20, max = 50) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || def, 1), max);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  return { limit, offset: (page - 1) * limit, page };
};
