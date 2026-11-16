import { Router } from 'express';
import { Community, Membership, Post } from '../db.js';
import { config } from '../config.js';
import { requireAuth, isMod } from '../auth.js';
import { wrap, HttpError, str } from '../util.js';

const router = Router();

/** Adds member / post counts and the viewer's role to a list of community documents (3 small queries). */
async function decorate(communities, viewer) {
  if (!communities.length) return [];
  const ids = communities.map((c) => c._id);
  const count = (Model, extra = {}) =>
    Model.aggregate([{ $match: { community: { $in: ids }, ...extra } }, { $group: { _id: '$community', n: { $sum: 1 } } }]);
  const [members, posts, mine] = await Promise.all([
    count(Membership),
    count(Post, { removed: false }),
    viewer ? Membership.find({ community: { $in: ids }, user: viewer._id }, 'community role').lean() : [],
  ]);
  const M = new Map(members.map((x) => [String(x._id), x.n]));
  const P = new Map(posts.map((x) => [String(x._id), x.n]));
  const R = new Map(mine.map((x) => [String(x.community), x.role]));
  return communities.map((c) => {
    const my_role = R.get(String(c._id)) || null;
    return {
      id: String(c._id),
      name: c.name,
      title: c.title,
      description: c.description,
      kind: c.kind,
      created_by: c.created_by ? String(c.created_by) : null,
      created_at: c.created_at,
      members: M.get(String(c._id)) || 0,
      post_count: P.get(String(c._id)) || 0,
      my_role,
      joined: !!my_role,
    };
  });
}

const byName = (name) => Community.findOne({ name: String(name).toLowerCase() }).lean();

router.get(
  '/',
  wrap(async (req, res) => {
    const filter = req.query.kind ? { kind: String(req.query.kind) } : {};
    const rows = await decorate(await Community.find(filter).lean(), req.user);
    rows.sort((a, b) => b.members - a.members || a.name.localeCompare(b.name));
    res.json({ communities: rows });
  }),
);

router.get(
  '/:name',
  wrap(async (req, res) => {
    const c = await byName(req.params.name);
    if (!c) throw new HttpError(404, 'Community not found.');
    res.json({ community: (await decorate([c], req.user))[0] });
  }),
);

router.post(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    if (!isMod(req.user) && !config.allowStudentCommunities) throw new HttpError(403, 'Only teachers and admins can create communities.');
    const name = str(req.body.name, 30, { min: 3, name: 'Name' }).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) throw new HttpError(400, 'Name may only contain lowercase letters, numbers, hyphens and underscores.');
    const title = str(req.body.title || name, 80, { min: 1, name: 'Title' });
    const description = str(req.body.description || '', 500);
    const kind = ['general', 'course', 'department', 'club'].includes(req.body.kind) ? req.body.kind : 'general';
    if (await Community.exists({ name })) throw new HttpError(409, 'A community with that name already exists.');
    let c;
    try {
      c = (await Community.create({ name, title, description, kind, created_by: req.user._id })).toObject();
    } catch (e) {
      if (e.code === 11000) throw new HttpError(409, 'A community with that name already exists.');
      throw e;
    }
    await Membership.create({ community: c._id, user: req.user._id, role: 'mod' });
    res.status(201).json({ community: (await decorate([c], req.user))[0] });
  }),
);

router.patch(
  '/:name',
  requireAuth,
  wrap(async (req, res) => {
    const c = await byName(req.params.name);
    if (!c) throw new HttpError(404, 'Community not found.');
    const mem = await Membership.findOne({ community: c._id, user: req.user._id }, 'role').lean();
    if (!(isMod(req.user) || mem?.role === 'mod')) throw new HttpError(403, 'Not allowed.');
    const title = str(req.body.title ?? c.title, 80, { min: 1, name: 'Title' });
    const description = str(req.body.description ?? c.description, 500);
    await Community.updateOne({ _id: c._id }, { $set: { title, description } });
    res.json({ ok: true });
  }),
);

router.post(
  '/:name/join',
  requireAuth,
  wrap(async (req, res) => {
    const c = await byName(req.params.name);
    if (!c) throw new HttpError(404, 'Community not found.');
    await Membership.updateOne({ community: c._id, user: req.user._id }, { $setOnInsert: { role: 'member', joined_at: new Date() } }, { upsert: true });
    res.json({ joined: true });
  }),
);

router.post(
  '/:name/leave',
  requireAuth,
  wrap(async (req, res) => {
    const c = await byName(req.params.name);
    if (!c) throw new HttpError(404, 'Community not found.');
    await Membership.deleteOne({ community: c._id, user: req.user._id });
    res.json({ joined: false });
  }),
);

export default router;
