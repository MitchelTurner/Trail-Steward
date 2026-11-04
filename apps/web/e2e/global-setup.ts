import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function globalSetup(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  execSync('pnpm --filter db exec tsx scripts/prepare-pilot.ts', {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://trail:trail@127.0.0.1:5432/trail_steward',
    },
  });
}
