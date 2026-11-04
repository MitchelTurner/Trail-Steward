import { describe, expect, it } from 'vitest';
import { loadServerEnv } from './schemas';

const base = {
  JWT_SECRET: '0123456789abcdef',
  RESEND_API_KEY: 're_test',
  EMAIL_FROM: 'Trail Steward <noreply@example.com>',
  APP_BASE_URL: 'http://localhost:5173',
  API_BASE_URL: 'http://localhost:3000',
};

describe('loadServerEnv', () => {
  it('uses Alaska time and Railway private URLs when the public names are unset', () => {
    const env = loadServerEnv({
      ...base,
      DATABASE_PRIVATE_URL: 'postgresql://db/trail',
      REDIS_PRIVATE_URL: 'redis://redis:6379',
    });
    expect(env.TZ).toBe('America/Anchorage');
    expect(env.DATABASE_URL).toBe('postgresql://db/trail');
    expect(env.REDIS_URL).toBe('redis://redis:6379');
  });

  it('builds a Redis URL from Railway host variables', () => {
    const env = loadServerEnv({
      ...base,
      DATABASE_URL: 'postgresql://db/trail',
      REDISHOST: 'redis.railway.internal',
      REDISPORT: '6379',
      REDISUSER: 'default',
      REDISPASSWORD: 'secret/pass',
    });
    expect(env.REDIS_URL).toBe('redis://default:secret%2Fpass@redis.railway.internal:6379');
  });

  it('fills test settings when the service variables are unset', () => {
    const env = loadServerEnv({
      DATABASE_URL: 'postgresql://db/trail',
      REDIS_URL: 'redis://redis:6379',
      RAILWAY_PUBLIC_DOMAIN: 'api.up.railway.app',
    });
    expect(env.JWT_SECRET).toBe('trail-steward-test-secret');
    expect(env.RESEND_API_KEY).toBe('re_test');
    expect(env.EMAIL_FROM).toBe('Trail Steward <noreply@example.com>');
    expect(env.APP_BASE_URL).toBe('https://api.up.railway.app');
    expect(env.API_BASE_URL).toBe('https://api.up.railway.app');
  });
});
