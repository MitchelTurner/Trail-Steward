import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api';
import type { Page } from '../types';
import { buttonClass } from '../ui';

type ChangeRow = {
  id: string;
  message: string;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
  trail: { slug: string; name: string };
};

const STATUS_LABEL = {
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  REJECTED: 'Not accepted',
} as const;

export function ChangeRequestsAdmin() {
  const client = useQueryClient();
  const changes = useQuery({
    queryKey: ['change-requests'],
    queryFn: () => api<Page<ChangeRow>>('/api/change-requests?pageSize=100'),
  });
  const resolve = useMutation({
    mutationFn: (body: { id: string; status: 'ACCEPTED' | 'REJECTED' }) =>
      api(`/api/change-requests/${body.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status: body.status }),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['change-requests'] });
      await client.invalidateQueries({ queryKey: ['dashboard'] });
      await client.invalidateQueries({ queryKey: ['maintenance-board'] });
    },
  });

  if (changes.isLoading) return <p>Loading…</p>;
  if (changes.error instanceof ApiError) return <p>{changes.error.message}</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-navy">Map changes</h2>
      <p>Accepting a request does not move the line. Edit the trail after you accept it.</p>
      {changes.data?.items.length === 0 ? <p>No requests yet.</p> : null}
      <ul className="space-y-3">
        {changes.data?.items.map((change) => (
          <li key={change.id} className="space-y-2 rounded border border-line bg-card p-3">
            <p className="font-medium">
              {change.trail.name} · {STATUS_LABEL[change.status]}
            </p>
            <p className="text-sm">{change.message}</p>
            {change.status === 'OPEN' ? (
              <div className="flex flex-wrap gap-2">
                <button
                  className={buttonClass()}
                  type="button"
                  onClick={() => resolve.mutate({ id: change.id, status: 'ACCEPTED' })}
                >
                  Accept
                </button>
                <button
                  className={buttonClass('quiet')}
                  type="button"
                  onClick={() => resolve.mutate({ id: change.id, status: 'REJECTED' })}
                >
                  Do not accept
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
