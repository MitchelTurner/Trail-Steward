export type Freshness = 'current' | 'due' | 'stale' | 'never-reviewed';

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_WINDOW_DAYS = 30;

/**
 * due = within 30 days of reviewedAt + reviewIntervalDays (inclusive of both edges).
 * stale = after that instant.
 * A null review date is never-reviewed.
 */
export function freshness(
  reviewedAt: Date | null,
  intervalDays: number,
  now = new Date(),
): Freshness {
  if (reviewedAt == null) return 'never-reviewed';
  const dueAt = reviewedAt.getTime() + intervalDays * DAY_MS;
  const dueStart = dueAt - DUE_WINDOW_DAYS * DAY_MS;
  const time = now.getTime();
  if (time > dueAt) return 'stale';
  if (time >= dueStart) return 'due';
  return 'current';
}

export function freshnessLabel(value: Freshness, reviewedAt: Date | string | null): string {
  if (value === 'due') return 'Review due';
  if (value === 'stale') return 'Needs review';
  if (value === 'never-reviewed' || reviewedAt == null) return 'Not yet reviewed';
  const date = typeof reviewedAt === 'string' ? new Date(reviewedAt) : reviewedAt;
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Anchorage',
    month: 'short',
    year: 'numeric',
  }).format(date);
  return `Reviewed ${formatted}`;
}
