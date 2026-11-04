import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseUpstream, configuredUpstream, isTrailApi } from './api-upstream.mjs';

test('a trails API health body is not the stand-in health check', () => {
  assert.equal(isTrailApi({ status: 'ok', db: 'ok', redis: 'ok' }), true);
  assert.equal(isTrailApi({ ok: true, service: 'api' }), false);
});

test('the web host is not used as its own API', () => {
  assert.equal(
    configuredUpstream({
      API_BASE_URL: 'https://web-production-471f.up.railway.app',
      RAILWAY_PUBLIC_DOMAIN: 'web-production-471f.up.railway.app',
    }),
    'http://127.0.0.1:3000',
  );
});

test('off Railway, the configured upstream is kept', async () => {
  const chosen = await chooseUpstream({ API_UPSTREAM: 'http://127.0.0.1:3000' }, async () => false);
  assert.equal(chosen, 'http://127.0.0.1:3000');
});

test('on Railway, a healthy private API is used', async () => {
  const chosen = await chooseUpstream(
    { RAILWAY_ENVIRONMENT: 'production', PORT: '8080' },
    async (url) => url === 'http://api.railway.internal:8080',
  );
  assert.equal(chosen, 'http://api.railway.internal:8080');
});

test('on Railway, an unreachable API falls back to this service', async () => {
  const chosen = await chooseUpstream(
    {
      RAILWAY_ENVIRONMENT: 'production',
      API_UPSTREAM: 'https://api-production-471f.up.railway.app',
    },
    async () => false,
  );
  assert.equal(chosen, 'http://127.0.0.1:3000');
});
