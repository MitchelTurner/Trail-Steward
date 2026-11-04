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
});
