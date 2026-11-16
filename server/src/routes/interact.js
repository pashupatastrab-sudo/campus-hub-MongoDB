import { Router } from 'express';
import { Post, Comment, Vote, Notification, Report, User } from '../db.js';
import { requireAuth, requireMod, isMod } from '../auth.js';
import { wrap, HttpError, notify, toId } from '../util.js';

const router = Router();
const modelFor = (type) => (type === 'post' ? Post : Comment);

// ---- Votes ----------------------------------------------------------------
router.post(
  '/votes',
  requireAuth,
  wrap(async (req, res) => {
    const type = req.body.type;
    const id = toId(req.body.id);
    const value = Number(req.body.value);
    if (!['post', 'comment'].includes(type) || !id) throw new HttpError(400, 'Invalid vote.');
    if (![-1, 0, 1].includes(value)) throw new HttpError(400, 'Invalid vote value.');
    const target = await modelFor(type).findById(id, 'user').lean();
    if (!target) throw new HttpError(404, 'Not found.');
    if (String(target.user) === req.user.id) throw new HttpError(400, "You can't vote on your own content.");

    const key = { user: req.user._id, target_type: type, target: id };
    if (value === 0) await Vote.deleteOne(key);
    else await Vote.updateOne(key, { $set: { value } }, { upsert: true });
    // The score is a denormalised counter on the post/comment, recomputed from the votes collection.
    const [sum] = await Vote.aggregate([{ $match: { target_type: type, target: id } }, { $group: { _id: null, s: { $sum: '$value' } } }]);
    const score = sum?.s ?? 0;
    await modelFor(type).updateOne({ _id: id }, { $set: { score } });
    res.json({ score, my_vote: value });
  }),
);

// ---- Comment actions ---------------------------------------------------------
router.delete(
  '/comments/:id',
  requireAuth,
  wrap(async (req, res) => {
    const c = await Comment.findById(toId(req.params.id)).lean();
    if (!c) throw new HttpError(404, 'Comment not found.');
    const own = String(c.user) === req.user.id;
    if (!own && !isMod(req.user)) throw new HttpError(403, 'Not allowed.');
    await Comment.updateOne({ _id: c._id }, { $set: { removed: true, endorsed: false } });
    if (!own) await notify({ userId: c.user, type: 'removed', actorId: req.user._id, postId: c.post, commentId: c._id, message: 'A moderator removed your comment.' });
    res.json({ ok: true });
  }),
);

router.post(
  '/comments/:id/restore',
  requireAuth,
  requireMod,
  wrap(async (req, res) => {
    const id = toId(req.params.id);
    if (id) await Comment.updateOne({ _id: id }, { $set: { removed: false } });
    res.json({ ok: true });
  }),
);

// Teacher-endorsed answer.
router.post(
  '/comments/:id/endorse',
  requireAuth,
  requireMod,
  wrap(async (req, res) => {
    const id = toId(req.params.id);
    const c = id && (await Comment.findOne({ _id: id, removed: false }).lean());
    if (!c) throw new HttpError(404, 'Comment not found.');
    const val = !c.endorsed;
    await Comment.updateOne({ _id: c._id }, { $set: { endorsed: val } });
    if (val) await notify({ userId: c.user, type: 'endorsed', actorId: req.user._id, postId: c.post, commentId: c._id, message: `${req.user.display_name} endorsed your answer.` });
    res.json({ endorsed: val });
  }),
);

// ---- Notifications --------------------------------------------------------------
router.get(
  '/notifications',
  requireAuth,
  wrap(async (req, res) => {
    const rows = await Notification.find({ user: req.user._id }).sort({ created_at: -1, _id: -1 }).limit(100).lean();
    const actorIds = [...new Set(rows.filter((n) => n.actor).map((n) => String(n.actor)))];
    const actors = actorIds.length ? await User.find({ _id: { $in: actorIds } }, 'username').lean() : [];
    const A = new Map(actors.map((u) => [String(u._id), u.username]));
    res.json({
      notifications: rows.map((n) => ({
        id: String(n._id),
        type: n.type,
        post_id: n.post ? String(n.post) : null,
        comment_id: n.comment ? String(n.comment) : null,
        message: n.message,
        read: !!n.read,
        created_at: n.created_at,
        actor: n.actor ? A.get(String(n.actor)) ?? null : null,
      })),
    });
  }),
);
router.post(
  '/notifications/read',
  requireAuth,
  wrap(async (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(toId).filter(Boolean) : null;
    const filter = ids?.length ? { _id: { $in: ids }, user: req.user._id } : { user: req.user._id };
    await Notification.updateMany(filter, { $set: { read: true } });
    res.json({ ok: true });
  }),
);

// ---- Reports -------------------------------------------------------------------
router.post(
  '/reports',
  requireAuth,
  wrap(async (req, res) => {
    const type = req.body.type;
    const id = toId(req.body.id);
    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!['post', 'comment'].includes(type) || !id) throw new HttpError(400, 'Invalid report.');
    if (reason.length < 3) throw new HttpError(400, 'Please describe the problem.');
    if (!(await modelFor(type).exists({ _id: id }))) throw new HttpError(404, 'Not found.');
    await Report.updateOne(
      { reporter: req.user._id, target_type: type, target: id },
      { $set: { reason, status: 'open' } },
      { upsert: true },
    );
    res.status(201).json({ ok: true });
  }),
);

router.get(
  '/reports',
  requireAuth,
  requireMod,
  wrap(async (req, res) => {
    const status = ['open', 'dismissed', 'actioned'].includes(req.query.status) ? req.query.status : 'open';
    const rows = await Report.find({ status }).sort({ created_at: -1 }).limit(200).lean();
    const ids = (type) => rows.filter((r) => r.target_type === type).map((r) => r.target);
    const [posts, comments] = await Promise.all([
      Post.find({ _id: { $in: ids('post') } }, 'title removed user').lean(),
      Comment.find({ _id: { $in: ids('comment') } }, 'body removed user post').lean(),
    ]);
    const userIds = [...new Set([...rows.map((r) => String(r.reporter)), ...posts.map((p) => String(p.user)), ...comments.map((c) => String(c.user))])];
    const users = await User.find({ _id: { $in: userIds } }, 'username').lean();
    const U = new Map(users.map((u) => [String(u._id), u.username]));
    const P = new Map(posts.map((p) => [String(p._id), { id: String(p._id), text: p.title, removed: !!p.removed, author: U.get(String(p.user)), post_id: String(p._id) }]));
    const C = new Map(comments.map((c) => [String(c._id), { id: String(c._id), text: c.body, removed: !!c.removed, author: U.get(String(c.user)), post_id: String(c.post) }]));
    res.json({
      reports: rows.map((r) => ({
        id: String(r._id),
        type: r.target_type,
        target_id: String(r.target),
        reason: r.reason,
        status: r.status,
        reporter: U.get(String(r.reporter)),
        created_at: r.created_at,
        target: (r.target_type === 'post' ? P : C).get(String(r.target)) ?? null,
      })),
    });
  }),
);

router.post(
  '/reports/:id/resolve',
  requireAuth,
  requireMod,
  wrap(async (req, res) => {
    const id = toId(req.params.id);
    const r = id && (await Report.findById(id).lean());
    if (!r) throw new HttpError(404, 'Report not found.');
    const action = req.body.action === 'remove' ? 'remove' : 'dismiss';
    if (action === 'remove') {
      const t = await modelFor(r.target_type).findById(r.target, 'user post').lean();
      if (t) {
        await modelFor(r.target_type).updateOne({ _id: t._id }, { $set: { removed: true } });
        await notify({
          userId: t.user,
          type: 'removed',
          actorId: req.user._id,
          postId: r.target_type === 'post' ? t._id : t.post,
          message: `A moderator removed your ${r.target_type} after a report.`,
        });
      }
    }
    // resolve all reports on the same target
    await Report.updateMany(
      { target_type: r.target_type, target: r.target },
      { $set: { status: action === 'remove' ? 'actioned' : 'dismissed', resolved_by: req.user._id } },
    );
    res.json({ ok: true });
  }),
);

export default router;
