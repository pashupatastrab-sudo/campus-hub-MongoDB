import { Router } from 'express';
import { User, Community, Membership, Post, Comment, Vote, Attachment, Notification, Report } from '../db.js';
import { requireAuth, requireMod, isMod } from '../auth.js';
import { wrap, HttpError, str, notify, notifyMany, paginate, toId, needId, idOf } from '../util.js';
import { deleteObject } from '../storage.js';

const router = Router();

const uniq = (ids) => [...new Map(ids.map((x) => [String(x), x])).values()];
const GONE = { username: '[deleted]', display_name: '[deleted]', role: 'student', teacher_status: 'none' };
const author = (u = GONE) => ({
  username: u.username,
  display_name: u.display_name,
  role: u.role,
  verified_teacher: u.role === 'admin' || (u.role === 'teacher' && u.teacher_status === 'approved'),
});
const fileOut = (a) => ({ id: a._id, filename: a.filename, mime: a.mime, size: a.size, url: `/api/files/${a._id}` });

/**
 * Turns post documents into API objects. Authors, communities, the viewer's votes and attachments are
 * fetched with one batched query each (no per-post queries), then stitched together here.
 */
export async function hydratePosts(rows, viewer) {
  if (!rows.length) return [];
  const postIds = rows.map((r) => r._id);
  const [users, comms, votes, files] = await Promise.all([
    User.find({ _id: { $in: uniq(rows.map((r) => r.user)) } }, 'username display_name role teacher_status').lean(),
    Community.find({ _id: { $in: uniq(rows.map((r) => r.community)) } }, 'name title').lean(),
    viewer ? Vote.find({ user: viewer._id, target_type: 'post', target: { $in: postIds } }, 'target value').lean() : [],
    Attachment.find({ post: { $in: postIds } }, 'filename mime size post').sort({ created_at: 1, _id: 1 }).lean(),
  ]);
  const U = new Map(users.map((u) => [String(u._id), u]));
  const C = new Map(comms.map((c) => [String(c._id), c]));
  const V = new Map(votes.map((v) => [String(v.target), v.value]));
  const F = new Map();
  for (const f of files) {
    const k = String(f.post);
    if (!F.has(k)) F.set(k, []);
    F.get(k).push(fileOut(f));
  }
  const viewerId = viewer ? idOf(viewer) : null;
  return rows.map((r) => {
    const mine = viewerId === String(r.user);
    const hidden = r.removed && !isMod(viewer) && !mine;
    const media = F.get(String(r._id)) || [];
    const c = C.get(String(r.community)) || { name: '', title: '' };
    return {
      id: String(r._id),
      title: hidden ? '[removed]' : r.title,
      body: hidden ? '' : r.body,
      type: r.type,
      pinned: !!r.pinned,
      locked: !!r.locked,
      removed: !!r.removed,
      score: r.score,
      comment_count: r.comment_count,
      created_at: r.created_at,
      author: author(U.get(String(r.user))),
      community: { name: c.name, title: c.title },
      my_vote: V.get(String(r._id)) ?? 0,
      attachment_count: media.length,
      can_edit: mine,
      can_moderate: isMod(viewer),
      media: hidden ? [] : media,
    };
  });
}

const SORT = {
  hot: { pinned: -1, _hot: -1, _id: -1 },
  new: { pinned: -1, created_at: -1, _id: -1 },
  top: { score: -1, created_at: -1, _id: -1 },
  discussed: { comment_count: -1, created_at: -1, _id: -1 },
};

router.get(
  '/',
  wrap(async (req, res) => {
    const { limit, offset, page } = paginate(req);
    const sort = SORT[req.query.sort] ? req.query.sort : 'hot';
    const empty = () => res.json({ posts: [], page, has_more: false });

    // Every filter value is coerced to a string / looked up first, so query-string objects can't inject operators.
    const conds = [{ removed: false }];
    if (req.query.community) {
      const c = await Community.findOne({ name: String(req.query.community).toLowerCase() }, '_id').lean();
      if (!c) return empty();
      conds.push({ community: c._id });
    }
    if (req.query.author) {
      const u = await User.findOne({ username_lc: String(req.query.author).toLowerCase() }, '_id').lean();
      if (!u) return empty();
      conds.push({ user: u._id });
    }
    if (req.query.type) conds.push({ type: String(req.query.type) });
    if (req.query.feed === 'home' && req.user) {
      const mine = await Membership.find({ user: req.user._id }, 'community').lean();
      conds.push({ community: { $in: mine.map((m) => m.community) } });
    }
    if (req.query.sort === 'top' && req.query.t) {
      const days = { day: 1, week: 7, month: 30 }[req.query.t];
      if (days) conds.push({ created_at: { $gte: new Date(Date.now() - days * 86400000) } });
    }

    const pipeline = [{ $match: { $and: conds } }];
    if (sort === 'hot') {
      // Reddit-style "hot": (score + 2) / (age in hours + 2)
      pipeline.push({
        $addFields: {
          _hot: { $divide: [{ $add: ['$score', 2] }, { $add: [{ $divide: [{ $subtract: ['$$NOW', '$created_at'] }, 3600000] }, 2] }] },
        },
      });
    }
    pipeline.push({ $sort: SORT[sort] }, { $skip: offset }, { $limit: limit + 1 });
    const rows = await Post.aggregate(pipeline);
    res.json({ posts: await hydratePosts(rows.slice(0, limit), req.user), page, has_more: rows.length > limit });
  }),
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const r = await Post.findById(needId(req.params.id, 'Post not found.')).lean();
    if (!r) throw new HttpError(404, 'Post not found.');
    if (r.removed && !isMod(req.user) && req.user?.id !== String(r.user)) throw new HttpError(404, 'This post has been removed.');
    const [post] = await hydratePosts([r], req.user);
    res.json({ post: { ...post, attachments: post.media } });
  }),
);

router.post(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const community = await Community.findOne({ name: String(req.body.community || '').toLowerCase() }).lean();
    if (!community) throw new HttpError(400, 'Choose a community.');
    const title = str(req.body.title, 200, { min: 3, name: 'Title' });
    const body = str(req.body.body || '', 20000);
    const type = ['discussion', 'question', 'resource', 'announcement'].includes(req.body.type) ? req.body.type : 'discussion';
    if (type === 'announcement' && !isMod(req.user)) throw new HttpError(403, 'Only verified teachers and admins can post announcements.');

    const post = await Post.create({ community: community._id, user: req.user._id, title, body, type });
    const ids = Array.isArray(req.body.attachments) ? req.body.attachments.slice(0, 10).map(String) : [];
    if (ids.length) await Attachment.updateMany({ _id: { $in: ids }, user: req.user._id, post: null }, { $set: { post: post._id } });
    await Membership.updateOne({ community: community._id, user: req.user._id }, { $setOnInsert: { role: 'member', joined_at: new Date() } }, { upsert: true });

    if (type === 'announcement') {
      const members = await Membership.find({ community: community._id }, 'user').lean();
      await notifyMany(members.map((m) => m.user), {
        type: 'announcement',
        actorId: req.user._id,
        postId: post._id,
        message: `New announcement in ${community.title}: ${title}`,
      });
    }
    res.status(201).json({ id: String(post._id) });
  }),
);

router.patch(
  '/:id',
  requireAuth,
  wrap(async (req, res) => {
    const p = await Post.findById(needId(req.params.id, 'Post not found.')).lean();
    if (!p) throw new HttpError(404, 'Post not found.');
    if (String(p.user) !== req.user.id) throw new HttpError(403, 'You can only edit your own posts.');
    const body = str(req.body.body ?? p.body, 20000);
    const title = str(req.body.title ?? p.title, 200, { min: 3, name: 'Title' });
    await Post.updateOne({ _id: p._id }, { $set: { body, title } });
    res.json({ ok: true });
  }),
);

/** Permanently deletes a post and everything that hangs off it (the job foreign-key cascades did in SQL). */
async function purgePost(post) {
  const files = await Attachment.find({ post: post._id }, 'storage_key').lean();
  const commentIds = (await Comment.find({ post: post._id }, '_id').lean()).map((c) => c._id);
  const aboutThis = [{ target_type: 'post', target: post._id }, { target_type: 'comment', target: { $in: commentIds } }];
  await Promise.all([
    Comment.deleteMany({ post: post._id }),
    Vote.deleteMany({ $or: aboutThis }),
    Report.deleteMany({ $or: aboutThis }),
    Notification.deleteMany({ post: post._id }),
    Attachment.deleteMany({ post: post._id }),
  ]);
  await Post.deleteOne({ _id: post._id });
  await Promise.all(files.map((f) => deleteObject(f.storage_key)));
}

router.delete(
  '/:id',
  requireAuth,
  wrap(async (req, res) => {
    const p = await Post.findById(needId(req.params.id, 'Post not found.')).lean();
    if (!p) throw new HttpError(404, 'Post not found.');
    const own = String(p.user) === req.user.id;
    if (!own && !isMod(req.user)) throw new HttpError(403, 'Not allowed.');
    if (own) {
      await purgePost(p); // author deletion is permanent, including uploaded files
    } else {
      await Post.updateOne({ _id: p._id }, { $set: { removed: true, pinned: false } });
      await notify({ userId: p.user, type: 'removed', actorId: req.user._id, postId: p._id, message: `A moderator removed your post "${p.title}".` });
    }
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/restore',
  requireAuth,
  requireMod,
  wrap(async (req, res) => {
    await Post.updateOne({ _id: needId(req.params.id, 'Post not found.') }, { $set: { removed: false } });
    res.json({ ok: true });
  }),
);

const toggle = (field) =>
  wrap(async (req, res) => {
    const p = await Post.findById(needId(req.params.id, 'Post not found.'), field).lean();
    if (!p) throw new HttpError(404, 'Post not found.');
    const val = !p[field];
    await Post.updateOne({ _id: p._id }, { $set: { [field]: val } });
    res.json({ [field]: val });
  });
router.post('/:id/pin', requireAuth, requireMod, toggle('pinned'));
router.post('/:id/lock', requireAuth, requireMod, toggle('locked'));

// ---- Comments -------------------------------------------------------------
router.get(
  '/:id/comments',
  wrap(async (req, res) => {
    const postId = needId(req.params.id, 'Post not found.');
    const uid = req.user?.id;
    const rows = await Comment.find({ post: postId }).sort({ created_at: 1, _id: 1 }).lean();
    const [users, votes] = await Promise.all([
      User.find({ _id: { $in: uniq(rows.map((r) => r.user)) } }, 'username display_name role teacher_status').lean(),
      uid && rows.length ? Vote.find({ user: req.user._id, target_type: 'comment', target: { $in: rows.map((r) => r._id) } }, 'target value').lean() : [],
    ]);
    const U = new Map(users.map((u) => [String(u._id), u]));
    const V = new Map(votes.map((v) => [String(v.target), v.value]));
    const mod = isMod(req.user);
    res.json({
      comments: rows.map((r) => {
        const hidden = r.removed && !mod;
        return {
          id: String(r._id),
          parent_id: r.parent ? String(r.parent) : null,
          body: hidden ? '[removed]' : r.body,
          removed: !!r.removed,
          endorsed: !!r.endorsed,
          score: r.score,
          created_at: r.created_at,
          author: author(U.get(String(r.user))),
          my_vote: V.get(String(r._id)) ?? 0,
          can_delete: !!uid && (uid === String(r.user) || mod),
        };
      }),
    });
  }),
);

router.post(
  '/:id/comments',
  requireAuth,
  wrap(async (req, res) => {
    const post = await Post.findOne({ _id: needId(req.params.id, 'Post not found.'), removed: false }).lean();
    if (!post) throw new HttpError(404, 'Post not found.');
    if (post.locked && !isMod(req.user)) throw new HttpError(403, 'This thread is locked.');
    const body = str(req.body.body, 10000, { min: 1, name: 'Comment' });
    let parent = null;
    if (req.body.parent_id) {
      const pid = toId(req.body.parent_id);
      parent = pid && (await Comment.findOne({ _id: pid, post: post._id }).lean());
      if (!parent) throw new HttpError(400, 'Parent comment not found.');
    }
    const comment = await Comment.create({ post: post._id, parent: parent?._id ?? null, user: req.user._id, body });
    await Post.updateOne({ _id: post._id }, { $inc: { comment_count: 1 } });
    const who = req.user.display_name;
    if (parent) await notify({ userId: parent.user, type: 'reply', actorId: req.user._id, postId: post._id, commentId: comment._id, message: `${who} replied to your comment.` });
    if (!parent || String(parent.user) !== String(post.user))
      await notify({ userId: post.user, type: 'comment', actorId: req.user._id, postId: post._id, commentId: comment._id, message: `${who} commented on "${post.title}".` });
    res.status(201).json({ id: String(comment._id) });
  }),
);

export default router;
