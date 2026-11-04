import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { Freshness } from 'shared';
import { ORG_KIND_LABELS, orgKinds } from 'shared/kinds';

export function freshnessLabel(value: Freshness, reviewedAt: string | null): string {
  if (value === 'never-reviewed') return 'Not yet reviewed';
  if (value === 'due') return 'Review due';
  if (value === 'stale') return 'Needs review';
  if (!reviewedAt) return 'Reviewed';
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Anchorage',
    month: 'short',
    year: 'numeric',
  }).format(new Date(reviewedAt));
  return `Reviewed ${formatted}`;
}

export function FreshnessBadge({
  value,
  reviewedAt,
}: {
  value: Freshness;
  reviewedAt: string | null;
}) {
  const tone =
    value === 'stale' || value === 'never-reviewed'
      ? 'bg-stalebg text-stale'
      : value === 'due'
        ? 'bg-duebg text-due'
        : 'bg-okbg text-okfg';
  return (
    <span className={`inline-block rounded px-2 py-1 text-sm font-medium ${tone}`}>
      {freshnessLabel(value, reviewedAt)}
    </span>
  );
}

export function linkLabel(status: string): string {
  if (status === 'OK') return 'Link ok';
  if (status === 'REDIRECT') return 'Link redirects';
  if (status === 'BROKEN') return 'Link broken';
  return 'Link not checked';
}

export function LinkStatus({ status }: { status: string }) {
  const tone = status === 'BROKEN' ? 'text-stale' : status === 'OK' ? 'text-okfg' : 'text-muted';
  return <span className={`text-sm ${tone}`}>{linkLabel(status)}</span>;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-white no-underline">
            Trail Steward
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm">
            <NavLink to="/map" className="text-white">
              Map
            </NavLink>
            <NavLink to="/orgs" className="text-white">
              Directory
            </NavLink>
            <NavLink to="/suggest" className="text-white">
              Suggest a correction
            </NavLink>
            <NavLink to="/login" className="text-white">
              Sign in
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}

export function WrongLink({ type, id }: { type: string; id?: string }) {
  const params = new URLSearchParams({ type });
  if (id) params.set('id', id);
  return (
    <Link to={`/suggest?${params.toString()}`} className="text-sm">
      Something wrong?
    </Link>
  );
}

export function kindLabel(kind: string): string {
  if ((orgKinds as readonly string[]).includes(kind)) {
    return ORG_KIND_LABELS[kind as (typeof orgKinds)[number]];
  }
  return kind;
}

// TODO(spec): the source spreadsheet's tile colors were not in the repo. These are distinct stand-ins.
export const TOPIC_COLORS: Record<string, string> = {
  'jurisdiction-land-management': '#1f4e79',
  'permitting-land-access': '#215c4a',
  'planning-prioritization': '#6b4c2a',
  'funding-grants': '#1f6b4a',
  'construction-maintenance': '#8a5a12',
  'promotion-visitor-info': '#0e6b6b',
  'data-stewardship': '#3d4f8a',
  'convening-coordinating': '#1b365d',
  'safety-education': '#8a3a2a',
  'platform-creation-hosting': '#24556b',
  'workforce-dev-training': '#3f6b3a',
  governance: '#2c3e50',
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-navy">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full rounded border border-line bg-white px-3 py-2 text-base text-ink min-h-11';

export function buttonClass(kind: 'primary' | 'quiet' = 'primary'): string {
  if (kind === 'quiet') {
    return 'inline-flex min-h-11 items-center justify-center rounded border border-navy px-4 py-2 text-navy';
  }
  return 'inline-flex min-h-11 items-center justify-center rounded bg-forest px-4 py-2 font-medium text-white';
}
