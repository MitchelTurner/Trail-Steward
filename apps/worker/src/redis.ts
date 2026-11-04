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
