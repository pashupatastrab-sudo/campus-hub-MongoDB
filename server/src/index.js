import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { config } from './config.js';
import { connectDb, dbReady } from './db.js';
import { optionalAuth } from './auth.js';
import { storageDriver, checkStorage } from './storage.js';
import authRoutes from './routes/auth.js';
import communityRoutes from './routes/communities.js';
import postRoutes from './routes/posts.js';
import interactRoutes from './routes/interact.js';
import miscRoutes from './routes/misc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1); // behind nginx / ALB
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'img-src': ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        'media-src': ["'self'", 'blob:', 'https:', 'http:'],
        'upgrade-insecure-requests': null, // demo may be served over plain http
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'frame-src': ["'self'", 'https:'], // inline PDF previews
        'object-src': ["'self'", 'https:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    strictTransportSecurity: false, // demo may run over plain http
  }),
);
app.use(compression());
if (!config.isProd) app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '2mb' }));
app.use(optionalAuth);

app.get('/api/health', async (_req, res) => res.json({ ok: dbReady(), database: dbReady() ? 'mongodb' : 'disconnected', storage: storageDriver, check: await checkStorage() }));
app.use('/api/auth', authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts', postRoutes);
app.use('/api', interactRoutes);
app.use('/api', miscRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Serve the built React app in production.
const dist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${config.maxUploadMb} MB).` : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong.' : err.message });
});

try {
  await connectDb();
} catch (e) {
  console.error(`\n[db] ${e.message}\n`);
  process.exit(1);
}

app.listen(config.port, async () => {
  console.log(`Campus Hub API on :${config.port}  (storage: ${storageDriver})`);
  const st = await checkStorage();
  console.log(`[storage] ${st.ok ? 'OK' : 'PROBLEM'} - ${st.driver}: ${st.detail}`);
});
