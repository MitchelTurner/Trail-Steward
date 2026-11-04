import { describe, expect, it } from 'vitest';
import { cleanupCutoff } from './cleanup';
import { checkUrl } from './link-check';
import { coordinatorDigest, maintainerDigest } from './reminders';

function response(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

describe('checkUrl', () => {
  it('marks a direct success as OK', async () => {
    const outcome = await checkUrl('https://example.test/a', async () => response(200));
    expect(outcome.linkStatus).toBe('OK');
    expect(outcome.linkHttpStatus).toBe(200);
  });

  it('follows a redirect and records REDIRECT', async () => {
    const outcome = await checkUrl('https://example.test/a', async (url) => {
      if (url.endsWith('/a')) return response(302, { location: 'https://example.test/b' });
      return response(200);
    });
    expect(outcome.linkStatus).toBe('REDIRECT');
    expect(outcome.linkFinalUrl).toBe('https://example.test/b');
  });

  it('falls back to GET when HEAD is not allowed', async () => {
    const methods: string[] = [];
    const outcome = await checkUrl('https://example.test/a', async (_url, init) => {
      methods.push(String(init.method));
      if (init.method === 'HEAD') return response(405);
      return response(200);
    });
    expect(methods).toEqual(['HEAD', 'GET']);
    expect(outcome.linkStatus).toBe('OK');
  });

  it('marks network failures as broken', async () => {
    const outcome = await checkUrl('https://example.test/missing', async () => {
      throw new Error('down');
    });
    expect(outcome.linkStatus).toBe('BROKEN');
  });
});

describe('cleanupCutoff', () => {
  it('is 18 months before the given date', () => {
    expect(cleanupCutoff(new Date('2026-11-03T12:00:00Z')).toISOString().slice(0, 10)).toBe(
      '2025-05-03',
    );
  });
});

describe('reminders', () => {
  it('groups stale and broken items by maintainer and lists unassigned items for coordinators', () => {
    const items = [
      {
        label: 'DNR Parks',
        freshness: 'stale' as const,
        maintainerEmail: 'ada@example.com',
        maintainerName: 'Ada',
      },
      {
        label: 'Old map',
        freshness: 'current' as const,
        maintainerEmail: 'ada@example.com',
        maintainerName: 'Ada',
        linkStatus: 'BROKEN',
      },
      {
        label: 'New org',
        freshness: 'never-reviewed' as const,
        maintainerEmail: null,
        maintainerName: null,
      },
    ];
    const digest = maintainerDigest(items).get('ada@example.com');
    expect(digest?.lines).toHaveLength(2);
    expect(coordinatorDigest(items)).toEqual(['New org — No maintainer, Not yet reviewed']);
  });
});
