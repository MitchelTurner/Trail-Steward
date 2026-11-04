import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadServerEnv } from 'shared';
import { chooseUpstream, trailApiReady } from './api-upstream.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const apiMain = fileURLToPath(new URL('../api/dist/main.js', import.meta.url));
const sharedMain = fileURLToPath(new URL('../../packages/shared/dist/index.js', import.meta.url));
const localApi = 'http://127.0.0.1:3000';

let pending;

function databaseUrl(env) {
  return env.DATABASE_URL || env.DATABASE_PRIVATE_URL || '';
}

function run(args, env) {
  return new Promise((resolve) => {
    const child = spawn('pnpm', args, { cwd: repoRoot, env, stdio: 'inherit' });
    child.once('error', () => resolve(1));
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

async function waitForApi(child) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    if (child.exitCode != null) return false;
    if (await trailApiReady(localApi)) return true;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 500));
  }
  return false;
}

async function startLocalApi() {
  const env = { ...process.env, PORT: '3000' };
  try {
    const resolved = loadServerEnv(env);
    env.DATABASE_URL = resolved.DATABASE_URL;
    env.REDIS_URL = resolved.REDIS_URL;
    env.TZ = resolved.TZ;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return false;
  }
  if (!databaseUrl(env)) {
    console.error('The map API was not started: DATABASE_URL is not set on the web service.');
    return false;
  }
  if (!existsSync(apiMain) || !existsSync(sharedMain)) {
    const built = await run(['--filter', 'api', 'build'], env);
    if (built !== 0) {
      console.error('The map API was not built.');
      return false;
    }
  }
  const migrated = await run(['--filter', 'db', 'exec', 'prisma', 'migrate', 'deploy'], env);
  if (migrated !== 0) {
    console.error('The map API database migration did not finish.');
    return false;
  }
  const child = spawn('pnpm', ['--filter', 'api', 'start'], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  });
  child.once('error', (error) => {
    console.error(error instanceof Error ? error.message : error);
  });
  const stop = () => {
    if (child.exitCode == null) child.kill('SIGTERM');
  };
  process.once('exit', stop);
  const ready = await waitForApi(child);
  if (!ready) console.error('The map API did not answer /api/health.');
  return ready;
}

export function ensureApiUpstream() {
  if (!pending) {
    pending = (async () => {
      const upstream = await chooseUpstream(process.env, trailApiReady);
      if (upstream === localApi && !(await trailApiReady(localApi))) {
        await startLocalApi();
      }
      console.log(`Trail API upstream is ${upstream}`);
      return upstream;
    })();
  }
  return pending;
}
