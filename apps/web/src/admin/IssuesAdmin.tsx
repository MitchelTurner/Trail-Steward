import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import type { OrgListItem, Page } from '../types';
import { buttonClass, inputClass } from '../ui';

type IssueRow = {
  id: string;
  title: string;
  detail: string;
  status: 'OPEN' | 'CLOSED';
  trail: { slug: string; name: string } | null;
  ownerOrg: { slug: string; name: string } | null;
};

export function IssuesAdmin() {
  const client = useQueryClient();
  const issues = useQuery({
    queryKey: ['issues'],
    queryFn: () => api<Page<IssueRow>>('/api/issues?pageSize=100'),
  });
  const orgs = useQuery({
    queryKey: ['orgs', 'manage', 'issues'],
    queryFn: () => api<Page<OrgListItem>>('/api/organizations?scope=manage&pageSize=200'),
  });
  const close = useMutation({
    mutationFn: (id: string) => api(`/api/issues/${id}/close`, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['issues'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const assign = useMutation({
    mutationFn: (body: { id: string; organizationId: string | null }) =>
      api(`/api/issues/${body.id}/owner`, {
        method: 'POST',
        body: JSON.stringify({ organizationId: body.organizationId }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['issues'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (issues.isLoading) return <p>Loading…</p>;
  if (issues.error instanceof ApiError) return <p>{issues.error.message}</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-navy">Issues</h2>
      {issues.data?.items.length === 0 ? <p>No reports yet.</p> : null}
      <ul className="space-y-3">
        {issues.data?.items.map((issue) => (
          <li key={issue.id} className="space-y-2 rounded border border-line bg-card p-3">
            <p className="font-medium">
              {issue.title} · {issue.status === 'OPEN' ? 'Open' : 'Closed'}
            </p>
            <p className="text-sm">{issue.detail}</p>
            <p className="text-sm text-muted">
              {issue.trail ? `Trail: ${issue.trail.name}` : 'No trail named'}
              {issue.ownerOrg ? ` · Owner: ${issue.ownerOrg.name}` : ' · No owner'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm">
                <span className="sr-only">Owner</span>
                <select
                  className={inputClass}
                  defaultValue=""
                  onChange={(event) => {
                    const organizationId = event.target.value || null;
                    assign.mutate({ id: issue.id, organizationId });
                  }}
                >
                  <option value="">Choose an owner</option>
                  {orgs.data?.items.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>
              {issue.status === 'OPEN' ? (
                <button className={buttonClass('quiet')} type="button" onClick={() => close.mutate(issue.id)}>
                  Close
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
