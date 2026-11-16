import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, Community, Membership, Notification } from '../db.js';
import { config } from '../config.js';
import { signToken, publicUser, requireAuth } from '../auth.js';
import { wrap, HttpError, str } from '../util.js';

const router = Router();
const limiter = (_req, _res, next) => next(); // demo: no rate limiting

// DEMO ONLY: passwords are stored and compared as plain text. Accounts created by older
// builds (bcrypt hashes starting with $2) still work.
const passwordOk = (given, stored) =>
  typeof stored === 'string' && (stored.startsWith('$2') ? bcrypt.compareSync(given, stored) : given === stored);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_COMMUNITIES = ['announcements', 'general', 'study-help'];

router.post(
  '/register',
  limiter,
  wrap(async (req, res) => {
    const email = str(req.body.email, 200, { min: 5, name: 'Email' }).toLowerCase();
    const username = str(req.body.username, 24, { min: 3, name: 'Username' });
    const display_name = str(req.body.display_name || username, 60, { min: 1, name: 'Display name' });
    const department = str(req.body.department || '', 80);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const wantsTeacher = req.body.role === 'teacher';

    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address.');
    if (!/^[A-Za-z0-9_]+$/.test(username)) throw new HttpError(400, 'Username may only contain letters, numbers and underscores.');
    if (password.length < 3) throw new HttpError(400, 'Password must be at least 3 characters.');
    if (config.allowedEmailDomains.length) {
      const domain = email.split('@')[1];
      const ok = config.allowedEmailDomains.some((d) => domain === d || domain.endsWith('.' + d));
      if (!ok) throw new HttpError(400, `Please use your college email (${config.allowedEmailDomains.join(', ')}).`);
    }
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.');
    if (await User.exists({ username_lc: username.toLowerCase() })) throw new HttpError(409, 'That username is taken.');

    const isFirst = !(await User.exists({}));
    const makeAdmin = isFirst || config.adminEmails.includes(email);
    const role = makeAdmin ? 'admin' : wantsTeacher ? 'teacher' : 'student';
    const teacher_status = makeAdmin ? 'approved' : wantsTeacher ? 'pending' : 'none';

    let user;
    try {
      user = (await User.create({ email, username, password_hash: password /* plain text (demo) */, display_name, role, teacher_status, department })).toObject();
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'An account with this email or username already exists.');
      throw e;
    }

    // Everyone starts in the default communities.
    const defaults = await Community.find({ name: { $in: DEFAULT_COMMUNITIES } }, '_id').lean();
    if (defaults.length) await Membership.insertMany(defaults.map((c) => ({ community: c._id, user: user._id })), { ordered: false });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.post(
  '/login',
  limiter,
  wrap(async (req, res) => {
    const id = str(req.body.identifier || req.body.email, 200, { min: 1, name: 'Email or username' }).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ $or: [{ email: id }, { username_lc: id }] }).lean();
    const ok = user && passwordOk(password, user.password_hash);
    if (!ok) throw new HttpError(401, 'Incorrect email/username or password.');
    if (user.banned) throw new HttpError(403, 'This account has been suspended.');
    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const unread = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ user: publicUser(req.user), unread });
  }),
);

router.patch(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const display_name = str(req.body.display_name ?? req.user.display_name, 60, { min: 1, name: 'Display name' });
    const bio = str(req.body.bio ?? req.user.bio, 300);
    const department = str(req.body.department ?? req.user.department, 80);
    await User.updateOne({ _id: req.user._id }, { $set: { display_name, bio, department } });
    res.json({ user: publicUser(await User.findById(req.user._id).lean()) });
  }),
);

router.post(
  '/password',
  requireAuth,
  limiter,
  wrap(async (req, res) => {
    const { current, next } = req.body;
    if (typeof next !== 'string' || next.length < 3) throw new HttpError(400, 'New password must be at least 3 characters.');
    if (!passwordOk(typeof current === 'string' ? current : '', req.user.password_hash)) throw new HttpError(403, 'Current password is incorrect.');
    await User.updateOne({ _id: req.user._id }, { $set: { password_hash: next } });
    res.json({ ok: true });
  }),
);

export default router;
