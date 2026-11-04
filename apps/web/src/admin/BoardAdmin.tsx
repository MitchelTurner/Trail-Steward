import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PACKET_STATUS_LABELS, packetStatuses } from 'shared/kinds';
import { api, ApiError } from '../api';
import { buttonClass, formatDay } from '../ui';

type Board = {
  trails: {
    slug: string;
    name: string;
    maintenanceOwner: { slug: string; name: string } | null;
    openIssues: { id: string; title: string; ownerName: string | null }[];
    plannedWorkdays: { id: string; title: string; workDate: string; hostName: string | null }[];
    openChangeRequests: { id: string; message: string }[];
    packets: { id: string; title: string; status: string }[];
  }[];
};

export function BoardAdmin() {
  const board = useQuery({
    queryKey: ['maintenance-board'],
    queryFn: () => api<Board>('/api/maintenance/board'),
  });
  if (board.isLoading) return <p>Loading…</p>;
  if (board.error instanceof ApiError) return <p>{board.error.message}</p>;
  const trails = board.data?.trails ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-navy">Maintenance board</h2>
      <p>Trails with an open problem, a planned work day, a map change waiting, or a saved work packet.</p>
      {trails.length === 0 ? <p>Nothing is waiting.</p> : null}
      <ul className="space-y-3">
        {trails.map((trail) => (
          <li key={trail.slug} className="space-y-2 rounded border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                <Link to={`/trails/${trail.slug}`}>{trail.name}</Link>
              </h3>
              <a className={buttonClass('quiet')} href={`/api/trails/${trail.slug}/packet`}>
                Download work list
              </a>
            </div>
            <p className="text-sm">
              {trail.maintenanceOwner
                ? `Maintenance owner: ${trail.maintenanceOwner.name}`
                : 'No maintenance owner is named yet.'}
            </p>
            {trail.openIssues.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Open problems</p>
                <ul className="text-sm">
                  {trail.openIssues.map((issue) => (
                    <li key={issue.id}>
                      {issue.title}
                      {issue.ownerName ? ` · ${issue.ownerName}` : ' · No owner'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {trail.plannedWorkdays.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Planned work</p>
                <ul className="text-sm">
                  {trail.plannedWorkdays.map((day) => (
                    <li key={day.id}>
                      {formatDay(day.workDate)} — {day.title}
                      {day.hostName ? ` · ${day.hostName}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {trail.packets.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Work packets</p>
                <ul className="text-sm">
                  {trail.packets.map((packet) => (
                    <li key={packet.id}>
                      {packet.title}
                      {' · '}
                      {PACKET_STATUS_LABELS[packet.status as (typeof packetStatuses)[number]] ?? packet.status}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {trail.openChangeRequests.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Map changes</p>
                <ul className="text-sm">
                  {trail.openChangeRequests.map((change) => (
                    <li key={change.id}>{change.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p>
              <Link to={`/admin/trails/edit/${trail.slug}`}>Edit trail</Link>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
