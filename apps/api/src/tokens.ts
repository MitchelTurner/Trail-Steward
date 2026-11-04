import type { ServerEnv } from 'shared';

export const ENV = Symbol('ENV');
export type { ServerEnv };

export function redisOptions(url: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: null;
  family: 0;
  tls?: Record<string, never>;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
    // Railway private DNS is IPv6 on older environments. 0 tries both.
    family: 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}

const test = process.env.NODE_ENV === 'test';

export const LIMITS = {
  suggestions: test ? 10_000 : 5,
  issues: test ? 10_000 : 5,
  changeRequests: test ? 10_000 : 5,
  packet: test ? 10_000 : 30,
  auth: test ? 10_000 : 10,
  checklistCreate: test ? 10_000 : 30,
  checklistPatch: test ? 10_000 : 600,
  pdf: test ? 10_000 : 30,
};
