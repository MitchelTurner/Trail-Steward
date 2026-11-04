import { freshness, type Freshness } from 'shared';

export type DigestItem = {
  label: string;
  freshness: Freshness;
  maintainerEmail: string | null;
  maintainerName: string | null;
  linkStatus?: string;
};

export function maintainerDigest(
  items: DigestItem[],
): Map<string, { name: string | null; lines: string[] }> {
  const byEmail = new Map<string, { name: string | null; lines: string[] }>();
  for (const item of items) {
    if (!item.maintainerEmail) continue;
    const state = item.freshness;
    const broken = item.linkStatus === 'BROKEN';
    if (state !== 'stale' && state !== 'due' && !broken) continue;
    const bucket = byEmail.get(item.maintainerEmail) ?? { name: item.maintainerName, lines: [] };
    const flags = [
      state === 'stale' ? 'Needs review' : '',
      state === 'due' ? 'Review due' : '',
      broken ? 'Broken link' : '',
    ].filter(Boolean);
    bucket.lines.push(`${item.label} — ${flags.join(', ')}`);
    byEmail.set(item.maintainerEmail, bucket);
  }
  return byEmail;
}

export function coordinatorDigest(items: DigestItem[]): string[] {
  return items
    .filter((item) => item.maintainerEmail == null || item.freshness === 'never-reviewed')
    .map((item) => {
      const bits = [
        item.maintainerEmail == null ? 'No maintainer' : '',
        item.freshness === 'never-reviewed' ? 'Not yet reviewed' : '',
      ].filter(Boolean);
      return `${item.label} — ${bits.join(', ')}`;
    });
}

export function reviewState(
  reviewedAt: Date | null,
  intervalDays: number,
  now = new Date(),
): Freshness {
  return freshness(reviewedAt, intervalDays, now);
}
