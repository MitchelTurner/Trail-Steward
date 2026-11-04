import { freshness, type Freshness } from 'shared';

type MaintainerRow = { id: string; name: string | null; email: string } | null;

export function presentMaintainer(user: MaintainerRow, detailed: boolean) {
  if (!user) return null;
  if (!detailed) return { name: user.name };
  return { id: user.id, name: user.name, email: user.email };
}

export function reviewFields(
  row: { reviewedAt: Date | null; reviewIntervalDays: number },
  maintainer: MaintainerRow,
  detailed: boolean,
): {
  reviewedAt: string | null;
  reviewIntervalDays: number;
  freshness: Freshness;
  maintainer: ReturnType<typeof presentMaintainer>;
} {
  return {
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    reviewIntervalDays: row.reviewIntervalDays,
    freshness: freshness(row.reviewedAt, row.reviewIntervalDays),
    maintainer: presentMaintainer(maintainer, detailed),
  };
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total };
}

export const publicContent = { visibility: 'PUBLIC' as const, status: 'PUBLISHED' as const };

export function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === '') return null;
  return value;
}
