import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Where this checkout's e2e run lives: its port, and the directory holding its
 * database and media, and the lock that stops two runs sharing them.
 *
 * Derived from the checkout path so that two worktrees — or two agents, each in
 * its own — can run the suite at the same time without sharing a port or a
 * database. Two runs in the SAME checkout get the same paths, so the second is
 * refused (see `e2e/server.mjs`) — it would otherwise delete the first run's
 * database, and a second `vite dev` in one directory would share
 * `node_modules/.vite` with the first, where a dependency re-optimization
 * reloads every connected page mid-test (see `optimizeDeps` in vite.config.ts).
 *
 * Deterministic rather than `mkdtemp`, because Playwright evaluates the config
 * again in every worker process: a random directory would differ between the
 * main process that starts the server and the workers whose specs read the
 * database.
 *
 * 20000–39999 stays clear of the vite dev default and below macOS's ephemeral
 * range (49152+), which transient outgoing sockets are drawn from.
 */
const KEY = createHash('sha1').update(process.cwd()).digest().readUInt16BE(0) % 20000;

export const E2E_PORT = 20000 + KEY;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_RUN_DIR = join(tmpdir(), `bound-up-e2e-${KEY}`);
export const E2E_MEDIA_DIR = join(E2E_RUN_DIR, 'media');
/**
 * Beside the run directory rather than inside it, because the run directory is
 * deleted once the lock is held. Kept short: a Unix socket path is capped at
 * 104 bytes on macOS, and `tmpdir()` there is already about 50.
 */
export const E2E_LOCK_PATH = join(tmpdir(), `bound-up-e2e-${KEY}.sock`);
export const E2E_DATABASE_URL = `file:${join(E2E_RUN_DIR, 'e2e.db')}`;
