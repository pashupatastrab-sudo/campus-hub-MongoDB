// Adds reusable fictional demo accounts and realistic sample activity.
// Run from the project root with: npm run seed:demo
// Demo-only credentials; never run this against a production database.
import { connectDb, mongoose, User, Community, Membership, Post, Comment } from './db.js';

const password = 'password123';

const demoUsers = [
  { email: 'admin@college.edu', username: 'admin', display_name: 'Campus Admin', role: 'admin', teacher_status: 'approved', department: 'Administration', bio: 'Keeping the campus community helpful, safe, and welcoming.' },
  { email: 'prof.rao@college.edu', username: 'prof_rao', display_name: 'Dr. Ananya Rao', role: 'teacher', teacher_status: 'approved', department: 'Computer Science', bio: 'Faculty member sharing programming resources and announcements.' },
  { email: 'prof.sharma@college.edu', username: 'prof_sharma', display_name: 'Prof. Kiran Sharma', role: 'teacher', teacher_status: 'approved', department: 'Electronics', bio: 'Interested in embedded systems, IoT, and student projects.' },
  { email: 'asha@college.edu', username: 'asha', display_name: 'Asha Kumar', role: 'student', teacher_status: 'none', department: 'Computer Science', bio: 'Learning Python and building small web projects.' },
  { email: 'ravi@college.edu', username: 'ravi', display_name: 'Ravi Shetty', role: 'student', teacher_status: 'none', department: 'Electronics', bio: 'IoT enthusiast and weekend football player.' },
  { email: 'meera@college.edu', username: 'meera', display_name: 'Meera Nair', role: 'student', teacher_status: 'none', department: 'Information Science', bio: 'Sharing study notes and hackathon updates.' },
  { email: 'arjun@college.edu', username: 'arjun', display_name: 'Arjun Patel', role: 'student', teacher_status: 'none', department: 'Mechanical', bio: 'Interested in robotics, design, and campus events.' },
  { email: 'nisha@college.edu', username: 'nisha', display_name: 'Nisha Gowda', role: 'student', teacher_status: 'none', department: 'Computer Science', bio: 'Enjoys helping classmates with data structures.' },
  { email: 'faiz@college.edu', username: 'faiz', display_name: 'Faiz Ahmed', role: 'student', teacher_status: 'none', department: 'Information Science', bio: 'Exploring UI design and full-stack development.' },
  { email: 'divya@college.edu', username: 'divya', display_name: 'Divya R', role: 'student', teacher_status: 'none', department: 'Electronics', bio: 'Working on a campus air-quality monitoring project.' },
];

await connectDb();

// A matching demo email is updated to keep the documented demo password reliable.
for (const user of demoUsers) {
  await User.updateOne(
    { email: user.email },
    { $set: { ...user, username_lc: user.username.toLowerCase(), password_hash: password /* plain text (demo) */ } },
    { upsert: true },
  );
}

const ids = {};
for (const u of await User.find({ username: { $in: demoUsers.map((d) => d.username) } }, 'username').lean()) ids[u.username] = u._id;
const userId = (username) => {
  if (!ids[username]) throw new Error(`Demo user not found after seeding: ${username}`);
  return ids[username];
};

const newCommunities = [
  ['cs101', 'CS101 - Intro to Programming', 'Programming questions, notes, and assignment discussions.', 'course', 'prof_rao'],
  ['iot-lab', 'IoT & Innovation Lab', 'Ideas, prototypes, sensors, and project collaboration.', 'club', 'prof_sharma'],
  ['campus-events', 'Campus Events', 'Clubs, competitions, workshops, and campus activities.', 'club', 'admin'],
];
for (const [name, title, description, kind, creator] of newCommunities) {
  await Community.updateOne({ name }, { $setOnInsert: { title, description, kind, created_by: userId(creator) } }, { upsert: true });
}

const communityIds = {};
for (const c of await Community.find({}, 'name').lean()) communityIds[c.name] = c._id;

const join = (community, user) =>
  Membership.updateOne({ community, user }, { $setOnInsert: { role: 'member', joined_at: new Date() } }, { upsert: true });

// Add all demo accounts to the default campus communities and selected groups.
for (const name of ['announcements', 'general', 'study-help']) {
  if (communityIds[name]) for (const user of demoUsers) await join(communityIds[name], userId(user.username));
}
const groupMembers = {
  cs101: ['prof_rao', 'asha', 'meera', 'nisha', 'faiz', 'admin'],
  'iot-lab': ['prof_sharma', 'ravi', 'divya', 'arjun', 'admin'],
  'campus-events': ['admin', 'asha', 'ravi', 'meera', 'arjun', 'nisha', 'faiz', 'divya'],
};
for (const [name, usernames] of Object.entries(groupMembers)) {
  if (!communityIds[name]) continue;
  for (const username of usernames) await join(communityIds[name], userId(username));
}
// Mark the course instructors as moderators.
await Membership.updateOne({ community: communityIds.cs101, user: userId('prof_rao') }, { $set: { role: 'mod' } });
await Membership.updateOne({ community: communityIds['iot-lab'], user: userId('prof_sharma') }, { $set: { role: 'mod' } });

const postData = [
  ['announcements', 'prof_rao', 'Mid-semester examination timetable', 'Mid-semester examinations begin next Monday. Please check the department notice board for the final timetable and arrive 15 minutes early.', 'announcement', true],
  ['general', 'ravi', 'Football this Saturday?', 'A few of us are planning a friendly match on the main ground at 4:00 PM this Saturday. Comment if you want to join!', 'discussion', false],
  ['study-help', 'asha', 'Quick revision: lists vs tuples in Python', 'Can someone share a simple example that explains when to use a list and when to use a tuple?', 'question', false],
  ['cs101', 'nisha', 'Tips for preparing for the data structures lab', 'I am revising stacks, queues, and linked lists this week. What are the most common mistakes to watch for in lab programs?', 'question', false],
  ['cs101', 'prof_rao', 'Python practice resources', 'Start with functions, lists, dictionaries, and file handling. Try writing a small program yourself before looking at a solution.', 'resource', false],
  ['iot-lab', 'divya', 'Air quality monitor prototype update', 'Our prototype reads air-quality and temperature values. Next we want to display the readings on an LCD and plot them on a dashboard.', 'discussion', false],
  ['iot-lab', 'prof_sharma', 'IoT lab open session', 'The lab will be open on Friday afternoon for students who want to test ESP32 boards and sensors. Bring your project notes.', 'announcement', false],
  ['campus-events', 'meera', 'Ideas for the next coding club meetup', 'Would people prefer a beginner-friendly web development workshop, a Python challenge, or a mini hackathon?', 'discussion', false],
  ['campus-events', 'arjun', 'Project showcase registrations', 'If you are building a prototype or software project, share a short title and your team size here. We are collecting ideas for a student showcase.', 'discussion', false],
  ['general', 'faiz', 'Looking for feedback on a UI design', 'I am redesigning a student dashboard. Which matters most to you: quick navigation, a clear activity feed, or notifications?', 'question', false],
];
for (const [communityName, username, title, body, type, pinned] of postData) {
  if (!communityIds[communityName]) continue;
  await Post.updateOne(
    { community: communityIds[communityName], user: userId(username), title },
    { $setOnInsert: { body, type, pinned } },
    { upsert: true },
  );
}

const commentData = [
  ['Quick revision: lists vs tuples in Python', 'ravi', 'Lists can be changed after creation; tuples are immutable. Use a list for items you expect to add or remove.'],
  ['Quick revision: lists vs tuples in Python', 'prof_rao', 'Good explanation. Also practise indexing, slicing, and looping through both types.'],
  ['Air quality monitor prototype update', 'arjun', 'Nice project! Consider adding a threshold alert when the sensor reading goes above your chosen limit.'],
  ['Ideas for the next coding club meetup', 'nisha', 'A short workshop followed by a mini challenge would be fun for beginners.'],
  ['Looking for feedback on a UI design', 'asha', 'A clear activity feed and easy navigation would help me find updates quickly.'],
];
for (const [title, username, body] of commentData) {
  const post = await Post.findOne({ title }, '_id').sort({ _id: -1 }).lean();
  if (post) await Comment.updateOne({ post: post._id, user: userId(username), body }, { $setOnInsert: { parent: null } }, { upsert: true });
}

// Keep the post comment counters consistent with seeded comments.
for (const { _id, n } of await Comment.aggregate([{ $group: { _id: '$post', n: { $sum: 1 } } }])) {
  await Post.updateOne({ _id }, { $set: { comment_count: n } });
}

console.log('Demo data ready. Login with any account below; password for all is: ' + password);
for (const user of demoUsers) console.log(`  ${user.role.padEnd(7)} ${user.username.padEnd(12)} ${user.email}`);
console.log('Seeding is repeatable and will not duplicate the demo posts/comments.');
await mongoose.disconnect();
