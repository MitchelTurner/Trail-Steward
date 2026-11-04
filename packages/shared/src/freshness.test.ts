import { describe, expect, it } from 'vitest';
import { freshness } from './freshness';

const DAY = 24 * 60 * 60 * 1000;

describe('freshness', () => {
  const reviewed = new Date('2026-01-01T00:00:00.000Z');
  const interval = 365;
  const dueAt = reviewed.getTime() + interval * DAY;
  const dueStart = dueAt - 30 * DAY;

  it('returns never-reviewed when there is no review date', () => {
    expect(freshness(null, 365, reviewed)).toBe('never-reviewed');
  });

  it('is current until the 30-day window opens', () => {
    expect(freshness(reviewed, interval, new Date(dueStart - 1))).toBe('current');
  });

  it('is due at the start of the 30-day window', () => {
    expect(freshness(reviewed, interval, new Date(dueStart))).toBe('due');
  });

  it('is still due exactly at the review deadline', () => {
    expect(freshness(reviewed, interval, new Date(dueAt))).toBe('due');
  });

  it('is stale one millisecond after the deadline', () => {
    expect(freshness(reviewed, interval, new Date(dueAt + 1))).toBe('stale');
  });

  it('is current the day after a review with a long interval', () => {
    expect(freshness(reviewed, interval, new Date(reviewed.getTime() + DAY))).toBe('current');
  });

  it('treats a short interval as due for the whole window, including the review instant', () => {
    expect(freshness(reviewed, 10, reviewed)).toBe('due');
  });
});
