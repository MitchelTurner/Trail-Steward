import { execSync } from 'node:child_process';
import net from 'node:net';

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

const [pg, redis] = await Promise.all([portOpen(5432), portOpen(6379)]);
if (pg && redis) {
  console.log('Postgres and Redis are already accepting connections.');
  process.exit(0);
}

try {
  execSync('docker compose up -d', { stdio: 'inherit' });
} catch {
  console.error(
    'Postgres (5432) and Redis (6379) are not both up, and Docker Compose did not start them.',
  );
  console.error(
    'Start them with `docker compose up -d`, or install local Postgres 16 + PostGIS and Redis.',
  );
  process.exit(1);
}
