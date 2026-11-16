import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { User, Community, Post, Comment, Attachment, Report } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin, publicUser } from '../auth.js';
import { wrap, HttpError, notify, needId, escapeRegex } from '../util.js';
import { putObject, openObject, deleteObject, storageDriver } from '../storage.js';
import { hydratePosts } from './posts.js';

const router = Router();

// ---- File uploads (local disk) ------------------------------------------------
const ALLOWED = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED[ext]) return cb(new HttpError(400, `File type ${ext || '(none)'} is not allowed.`));
    cb(null, true);
  },
});

router.post(
  '/uploads',
  requireAuth,
  upload.single('file'),
  wrap(async (req, res) => {
    if (!req.file) throw new HttpError(400, 'No file received.');
    const recent = await Attachment.countDocuments({ user: req.user._id, created_at: { $gt: new Date(Date.now() - 3600000) } });
    if (recent >= 200) throw new HttpError(429, 'Upload limit reached. Try again later.');

    const ext = path.extname(req.file.originalname).toLowerCase();
    const id = crypto.randomUUID();
    const key = `${new Date().getFullYear()}-${id}${ext}`;
    const mime = ALLOWED[ext]; // never trust the client-supplied mimetype
    await putObject(key, req.file.buffer, mime);
    const filename = path.basename(req.file.originalname).slice(0, 150);
    await Attachment.create({ _id: id, user: req.user._id, storage_key: key, filename, mime, size: req.file.size });
    res.status(201).json({ id, filename, mime, size: req.file.size, url: `/api/files/${id}` });
  }),
);

// Discard an upload that was never attached to a post (user removed it from the composer).
router.delete(
  '/uploads/:id',
  requireAuth,
  wrap(async (req, res) => {
    const a = await Attachment.findOne({ _id: String(req.params.id), user: req.user._id, post: null }).lean();
    if (a) {
      await Attachment.deleteOne({ _id: a._id });
      await deleteObject(a.storage_key);
    }
    res.json({ ok: true });
  }),
);

// Public by unguessable UUID so <img>/<video> tags work. Images, video, audio and PDFs are streamed
// through the API (cached by the browser; Range supported for video seeking). Other files download.
router.get(
  '/files/:id',
  wrap(async (req, res) => {
    const a = await Attachment.findById(String(req.params.id)).lean();
    if (!a) throw new HttpError(404, 'File not found.');
    const streamable = /^(image|video|audio)\//.test(a.mime) || a.mime === 'application/pdf';
    let obj;
    try {
      obj = await openObject(a.storage_key, req.headers.range);
    } catch (e) {
      if (e.code === 'ENOENT' || e.name === 'NoSuchKey') throw new HttpError(404, 'File missing.');
      throw e;
    }
    const inline = streamable;
    res.status(obj.status);
    for (const [k, v] of Object.entries(obj.headers)) res.set(k, String(v));
    res.set('Content-Type', a.mime);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=604800, immutable');
    res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
    obj.stream.on('error', () => res.destroy());
    obj.stream.pipe(res);
  }),
);

// ---- Search -------------------------------------------------------------------------
router.get(
  '/search',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    if (q.length < 2) return res.json({ posts: [], communities: [], users: [] });
    const rx = new RegExp(escapeRegex(q), 'i'); // case-insensitive substring match
    const [posts, communities, users] = await Promise.all([
      Post.find({ removed: false, $or: [{ title: rx }, { body: rx }] }).sort({ score: -1, created_at: -1 }).limit(40).lean(),
      Community.find({ $or: [{ name: rx }, { title: rx }, { description: rx }] }, 'name title description kind').limit(15).lean(),
      User.find({ banned: false, $or: [{ username: rx }, { display_name: rx }] }).limit(15).lean(),
    ]);
    res.json({
      posts: await hydratePosts(posts, req.user),
      communities: communities.map((c) => ({ name: c.name, title: c.title, description: c.description, kind: c.kind })),
      users: users.map(publicUser),
    });
  }),
);

// ---- Profiles ----------------------------------------------------------------------------
const sumScore = async (Model, user) => {
  const [r] = await Model.aggregate([{ $match: { user, removed: false } }, { $group: { _id: null, s: { $sum: '$score' } } }]);
  return r?.s ?? 0;
};

router.get(
  '/users/:username',
  wrap(async (req, res) => {
    const u = await User.findOne({ username_lc: String(req.params.username).toLowerCase() }).lean();
    if (!u || u.banned) throw new HttpError(404, 'User not found.');
    const [posts, comments, postKarma, commentKarma] = await Promise.all([
      Post.countDocuments({ user: u._id, removed: false }),
      Comment.countDocuments({ user: u._id, removed: false }),
      sumScore(Post, u._id),
      sumScore(Comment, u._id),
    ]);
    res.json({ user: publicUser(u), stats: { posts, comments, karma: postKarma + commentKarma } });
  }),
);

// ---- Admin -----------------------------------------------------------------------------------
router.get(
  '/admin/users',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const filter = {};
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ username: rx }, { email: rx }, { display_name: rx }];
    }
    if (req.query.filter === 'pending') filter.teacher_status = 'pending';
    if (req.query.filter === 'banned') filter.banned = true;
    const rows = await User.find(filter).sort({ created_at: -1 }).limit(200).lean();
    rows.sort((a, b) => (b.teacher_status === 'pending') - (a.teacher_status === 'pending')); // pending teachers first
    res.json({ users: rows.map((u) => ({ ...publicUser(u), email: u.email, banned: !!u.banned })) });
  }),
);

router.patch(
  '/admin/users/:id',
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const u = await User.findById(needId(req.params.id, 'User not found.')).lean();
    if (!u) throw new HttpError(404, 'User not found.');
    if (String(u._id) === req.user.id && (req.body.banned || (req.body.role && req.body.role !== 'admin')))
      throw new HttpError(400, "You can't demote or ban yourself.");
    let { role, teacher_status, banned } = { role: u.role, teacher_status: u.teacher_status, banned: !!u.banned };
    if (['student', 'teacher', 'admin'].includes(req.body.role)) role = req.body.role;
    if (['none', 'pending', 'approved'].includes(req.body.teacher_status)) teacher_status = req.body.teacher_status;
    if (typeof req.body.banned === 'boolean') banned = req.body.banned;
    if (role === 'teacher' && req.body.teacher_status === undefined && u.role !== 'teacher') teacher_status = 'approved';
    if (role === 'student') teacher_status = 'none';
    await User.updateOne({ _id: u._id }, { $set: { role, teacher_status, banned } });
    if (teacher_status === 'approved' && u.teacher_status !== 'approved')
      await notify({ userId: u._id, type: 'verified', actorId: req.user._id, message: 'Your teacher account has been verified. You can now moderate and post announcements.' });
    res.json({ ok: true });
  }),
);

router.get(
  '/admin/stats',
  requireAuth,
  requireAdmin,
  wrap(async (_req, res) => {
    const [users, pending_teachers, communities, posts, comments, open_reports, files, bytes] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ teacher_status: 'pending' }),
      Community.countDocuments(),
      Post.countDocuments({ removed: false }),
      Comment.countDocuments({ removed: false }),
      Report.countDocuments({ status: 'open' }),
      Attachment.countDocuments(),
      Attachment.aggregate([{ $group: { _id: null, s: { $sum: '$size' } } }]),
    ]);
    res.json({ users, pending_teachers, communities, posts, comments, open_reports, files, storage_bytes: bytes[0]?.s ?? 0, storage_driver: storageDriver });
  }),
);

export default router;
