export function redisOptions(url: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  maxRetriesPerRequest: null;
  tls?: Record<string, never>;
} {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
  };
}
