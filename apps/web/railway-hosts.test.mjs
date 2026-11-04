import assert from 'node:assert/strict';
import test from 'node:test';
import { railwayAllowedHosts } from './railway-hosts.mjs';

test('local Vite keeps its default host check', () => {
  assert.equal(railwayAllowedHosts({}), undefined);
});

test('Railway Vite accepts the public web host', () => {
  const hosts = railwayAllowedHosts({
    RAILWAY_ENVIRONMENT: 'production',
    RAILWAY_PUBLIC_DOMAIN: 'web-production-471f.up.railway.app',
    APP_BASE_URL: 'https://trails.example.com',
  });
  assert.ok(hosts);
  assert.equal(hosts.includes('.up.railway.app'), true);
  assert.equal(hosts.includes('web-production-471f.up.railway.app'), true);
  assert.equal(hosts.includes('trails.example.com'), true);
});
