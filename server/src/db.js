import mongoose from 'mongoose';
import { config } from './config.js';

const { Schema } = mongoose;
const ref = (model, extra = {}) => ({ type: Schema.Types.ObjectId, ref: model, ...extra });
const createdAt = { timestamps: { createdAt: 'created_at', updatedAt: false } };

// ---- users -------------------------------------------------------------------------------
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    username_lc: { type: String, required: true, unique: true }, // case-insensitive uniqueness / lookup
    password_hash: { type: String, required: true },
    display_name: { type: String, required: true },
    role: { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },
    teacher_status: { type: String, enum: ['none', 'pending', 'approved'], default: 'none' },
    department: { type: String, default: '' },
    bio: { type: String, default: '' },
    banned: { type: Boolean, default: false },
  },
  createdAt,
);
userSchema.pre('validate', function () {
  if (this.username) this.username_lc = this.username.toLowerCase();
});

// ---- communities + membership -----------------------------------------------------------------
const communitySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, lowercase: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    kind: { type: String, enum: ['general', 'course', 'department', 'club'], default: 'general' },
    created_by: ref('User', { default: null }),
  },
  createdAt,
);

const membershipSchema = new Schema({
  community: ref('Community', { required: true }),
  user: ref('User', { required: true }),
  role: { type: String, enum: ['member', 'mod'], default: 'member' },
  joined_at: { type: Date, default: Date.now },
});
membershipSchema.index({ community: 1, user: 1 }, { unique: true });
membershipSchema.index({ user: 1 });

// ---- posts / comments / votes ------------------------------------------------------------------
const postSchema = new Schema(
  {
    community: ref('Community', { required: true }),
    user: ref('User', { required: true }),
    title: { type: String, required: true },
    body: { type: String, default: '' },
    type: { type: String, enum: ['discussion', 'question', 'resource', 'announcement'], default: 'discussion' },
    pinned: { type: Boolean, default: false },
    locked: { type: Boolean, default: false },
    removed: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    comment_count: { type: Number, default: 0 },
  },
  createdAt,
);
postSchema.index({ community: 1, created_at: -1 });
postSchema.index({ user: 1, created_at: -1 });
postSchema.index({ removed: 1, created_at: -1 });

const commentSchema = new Schema(
  {
    post: ref('Post', { required: true }),
    parent: ref('Comment', { default: null }), // threaded replies: points at the parent comment
    user: ref('User', { required: true }),
    body: { type: String, required: true },
    removed: { type: Boolean, default: false },
    endorsed: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
  },
  createdAt,
);
commentSchema.index({ post: 1, created_at: 1 });
commentSchema.index({ user: 1 });

const voteSchema = new Schema({
  user: ref('User', { required: true }),
  target_type: { type: String, enum: ['post', 'comment'], required: true },
  target: { type: Schema.Types.ObjectId, required: true },
  value: { type: Number, enum: [-1, 1], required: true },
});
voteSchema.index({ user: 1, target_type: 1, target: 1 }, { unique: true });
voteSchema.index({ target_type: 1, target: 1 });

// ---- attachments / notifications / reports ----------------------------------------------------------
const attachmentSchema = new Schema(
  {
    _id: { type: String }, // uuid, used in the public /api/files/:id URL
    user: ref('User', { required: true }),
    post: ref('Post', { default: null }), // null until the post is submitted
    storage_key: { type: String, required: true },
    filename: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
  },
  createdAt,
);
attachmentSchema.index({ post: 1 });
attachmentSchema.index({ user: 1, created_at: -1 });

const notificationSchema = new Schema(
  {
    user: ref('User', { required: true }),
    type: { type: String, required: true },
    actor: ref('User', { default: null }),
    post: ref('Post', { default: null }),
    comment: { type: Schema.Types.ObjectId, default: null },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  createdAt,
);
notificationSchema.index({ user: 1, read: 1, created_at: -1 });

const reportSchema = new Schema(
  {
    reporter: ref('User', { required: true }),
    target_type: { type: String, enum: ['post', 'comment'], required: true },
    target: { type: Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['open', 'dismissed', 'actioned'], default: 'open' },
    resolved_by: ref('User', { default: null }),
  },
  createdAt,
);
reportSchema.index({ reporter: 1, target_type: 1, target: 1 }, { unique: true });
reportSchema.index({ status: 1, created_at: -1 });

export const User = mongoose.model('User', userSchema);
export const Community = mongoose.model('Community', communitySchema);
export const Membership = mongoose.model('Membership', membershipSchema);
export const Post = mongoose.model('Post', postSchema);
export const Comment = mongoose.model('Comment', commentSchema);
export const Vote = mongoose.model('Vote', voteSchema);
export const Attachment = mongoose.model('Attachment', attachmentSchema);
export const Notification = mongoose.model('Notification', notificationSchema);
export const Report = mongoose.model('Report', reportSchema);

const models = [User, Community, Membership, Post, Comment, Vote, Attachment, Notification, Report];
const redact = (uri) => uri.replace(/\/\/[^@/]*@/, '//***@');

/** Connects to MongoDB, builds indexes and creates the default communities on a fresh database. */
export async function connectDb() {
  try {
    await mongoose.connect(config.mongoUri, { dbName: config.mongoDb, serverSelectionTimeoutMS: 8000 });
  } catch (e) {
    throw new Error(`Could not connect to MongoDB at ${redact(config.mongoUri)} - ${e.message}\nStart MongoDB (or set MONGODB_URI in server/.env to your Atlas connection string).`);
  }
  await Promise.all(models.map((m) => m.init())); // create collections + indexes
  if ((await Community.estimatedDocumentCount()) === 0) {
    await Community.insertMany([
      { name: 'announcements', title: 'Announcements', description: 'Official notices from faculty and administration.', kind: 'general' },
      { name: 'general', title: 'General', description: 'Campus-wide chat, events and everything else.', kind: 'general' },
      { name: 'study-help', title: 'Study Help', description: 'Ask questions, share notes, help each other out.', kind: 'general' },
    ]);
  }
  console.log(`[db] MongoDB connected: ${redact(config.mongoUri)}${config.mongoDb ? ` (db: ${config.mongoDb})` : ''}`);
}

export const dbReady = () => mongoose.connection.readyState === 1;
export { mongoose };
