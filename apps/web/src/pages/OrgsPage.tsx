import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ORG_KIND_LABELS, orgKinds } from 'shared/kinds';
import { api } from '../api';
import type { OrgListItem, Page, TopicSummary } from '../types';
import { FreshnessBadge, buttonClass, inputClass, kindLabel } from '../ui';

export function OrgsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const topics = useQuery({
    queryKey: ['topics'],
    queryFn: () => api<TopicSummary[]>('/api/topics'),
  });
  const orgs = useQuery({
    queryKey: ['orgs', query],
    queryFn: () => api<Page<OrgListItem>>(`/api/organizations?${query}`),
  });

  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    if (name !== 'page') next.delete('page');
    setParams(next);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy">Directory</h1>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <label className="block text-sm">
          <span className="font-medium text-navy">Search</span>
          <input
            className={inputClass}
            defaultValue={params.get('q') ?? ''}
            onChange={(event) => update('q', event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-navy">Kind</span>
          <select
            className={inputClass}
            value={params.get('kind') ?? ''}
            onChange={(event) => update('kind', event.target.value)}
          >
            <option value="">All kinds</option>
            {orgKinds.map((kind) => (
              <option key={kind} value={kind}>
                {ORG_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-navy">Topic</span>
          <select
            className={inputClass}
            value={params.get('topic') ?? ''}
            onChange={(event) => update('topic', event.target.value)}
          >
            <option value="">All topics</option>
            {topics.data?.map((topic) => (
              <option key={topic.slug} value={topic.slug}>
                {topic.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-navy">Community</span>
          <input
            className={inputClass}
            defaultValue={params.get('community') ?? ''}
            onChange={(event) => update('community', event.target.value)}
          />
        </label>
      </form>
      {orgs.isLoading ? <p>Loading…</p> : null}
      {orgs.isError ? <p>Could not load the directory.</p> : null}
      <ul className="space-y-3">
        {orgs.data?.items.map((org) => (
          <li key={org.id} className="rounded border border-line bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link to={`/orgs/${org.slug}`} className="text-lg font-semibold">
                {org.name}
              </Link>
              <FreshnessBadge value={org.freshness} reviewedAt={org.reviewedAt} />
            </div>
            <p className="text-sm text-muted">{kindLabel(org.kind)}</p>
            {org.description ? <p className="mt-2 text-sm">{org.description}</p> : null}
          </li>
        ))}
      </ul>
      {orgs.data && orgs.data.total > orgs.data.pageSize ? (
        <div className="flex gap-2">
          <button
            className={buttonClass('quiet')}
            type="button"
            disabled={orgs.data.page <= 1}
            onClick={() => update('page', String(orgs.data ? orgs.data.page - 1 : 1))}
          >
            Previous
          </button>
          <button
            className={buttonClass('quiet')}
            type="button"
            disabled={orgs.data.page * orgs.data.pageSize >= orgs.data.total}
            onClick={() => update('page', String((orgs.data?.page ?? 1) + 1))}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
