import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Uploaded files live on local disk (UPLOAD_DIR); their metadata lives in the `attachments` collection.
const dir = config.storage.localDir;
fs.mkdirSync(dir, { recursive: true });

export const storageDriver = 'local';

export async function putObject(key, buffer) {
  await fs.promises.writeFile(path.join(dir, key), buffer);
}

export async function checkStorage() {
  return { ok: true, driver: 'local', detail: dir };
}

/**
 * Streams a stored file through the API so <img>/<video> tags work with no extra setup.
 * Supports HTTP Range for video seeking. Returns { stream, status, headers }.
 */
export async function openObject(key, range) {
  const file = path.join(dir, key);
  const stat = await fs.promises.stat(file); // throws ENOENT if missing
  const m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
    return {
      stream: fs.createReadStream(file, { start, end }),
      status: 206,
      headers: { 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes' },
    };
  }
  return { stream: fs.createReadStream(file), status: 200, headers: { 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' } };
}

export async function deleteObject(key) {
  try {
    await fs.promises.unlink(path.join(dir, key));
  } catch (e) {
    console.warn('[storage] delete failed', key, e.message);
  }
}
