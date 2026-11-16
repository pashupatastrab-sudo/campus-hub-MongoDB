# Campus Hub

**Your campus, connected.** Campus Hub is a Reddit-style community web app for students and teachers: communities, posts, threaded comments, voting, notifications, search, moderation and admin tools.

**Stack:** React + Vite · Node.js + Express · **MongoDB** (Mongoose).

## What it includes

- Student and teacher accounts, with admin verification and role controls.
- Course, department, club, and campus-wide communities.
- Posts for discussions, questions, resources, and announcements.
- Threaded comments, voting, notifications, search, moderation, and admin tools.
- Reddit-style media: image/video previews in the feed, galleries, lightbox, drag-and-drop and paste uploads (stored on local disk).

## Requirements

- Node.js 22 LTS or newer
- MongoDB: either a local MongoDB Community Server (`mongodb://127.0.0.1:27017`), Docker (`docker run -d -p 27017:27017 mongo:7`), or a free MongoDB Atlas cluster. Use **MongoDB Compass** if you want a GUI to browse the data.

## Run it (development)

```powershell
npm run install:all
copy .env.example server\.env      # then set MONGODB_URI if you are not using local MongoDB
npm run dev:server                 # API on http://localhost:4000
```

In a second terminal:

```powershell
npm run dev:client                 # web app on http://localhost:5173
```

Open `http://localhost:5173`. The first account you register becomes the admin.

## Run it (production-style, single server)

```powershell
npm run build                      # builds the React app into client/dist
npm start                          # Express serves the API and the built site on http://localhost:4000
```

Or with Docker (starts the app plus a MongoDB container): `docker compose up --build`.

## Load demo accounts and sample activity

With MongoDB running, from the project root:

```powershell
npm run seed:demo
```

This adds fictional users, campus communities, sample posts, and comments. It is safe to rerun and will not duplicate the seeded posts/comments. All demo accounts use the password `password123` (the login page has one-click fill buttons).

| Role | Username | Email |
|---|---|---|
| Admin | `admin` | `admin@college.edu` |
| Teacher | `prof_rao` | `prof.rao@college.edu` |
| Teacher | `prof_sharma` | `prof.sharma@college.edu` |
| Student | `asha` | `asha@college.edu` |
| Student | `ravi` | `ravi@college.edu` |
| Student | `meera` | `meera@college.edu` |
| Student | `arjun` | `arjun@college.edu` |
| Student | `nisha` | `nisha@college.edu` |
| Student | `faiz` | `faiz@college.edu` |
| Student | `divya` | `divya@college.edu` |

These are fictional accounts for classroom demonstrations only. Never seed demo accounts in a production environment.

## Data model (MongoDB collections)

| Collection | Holds | Notable indexes |
|---|---|---|
| `users` | accounts, role (`student`/`teacher`/`admin`), teacher verification, ban flag | unique `email`, unique `username_lc` |
| `communities` | name, title, kind (`general`/`course`/`department`/`club`) | unique `name` |
| `memberships` | who joined which community, and whether they moderate it | unique `(community, user)` |
| `posts` | title, body, type, pinned/locked/removed flags, `score` and `comment_count` counters | `(community, created_at)`, `(user, created_at)` |
| `comments` | threaded via a `parent` reference | `(post, created_at)` |
| `votes` | one vote per user per post/comment | unique `(user, target_type, target)` |
| `attachments` | uploaded file metadata (the file itself is stored on disk) | `post` |
| `notifications` | per-user notifications | `(user, read, created_at)` |
| `reports` | moderation reports | unique `(reporter, target_type, target)` |

Things worth pointing out in a demo: the "hot" feed ranking is a MongoDB **aggregation pipeline** (`$addFields` / `$sort` in `server/src/routes/posts.js`); vote scores and karma use `$group` aggregations; community member and post counts are aggregated too; `score` and `comment_count` are denormalised counters on the post for fast feeds; deleting a post cascades manually to its comments, votes, reports, notifications and files.

## Configuration

Settings come from `server/.env` (see `.env.example`): `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAILS`, `UPLOAD_DIR` and more. Uploaded files are stored on local disk.

## Demo-mode security

This build is for a classroom demo: **login only**. Passwords are stored in plain text, there is no rate limiting, and any email can register. Do not use it with real data.
