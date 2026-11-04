import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api';
import { TrailMap, type MapTrail } from '../features/map/TrailMap';
import type { Page } from '../types';

export function MapPage() {
  const trails = useQuery({
    queryKey: ['trails', 'public'],
    queryFn: () => api<Page<MapTrail & { summary: string }>>('/api/trails?pageSize=200'),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-navy">Trail map</h1>
      <p>Published trails in Southeast Alaska. Pick a line to see who looks after it.</p>
      {trails.isLoading ? <p>Loading the map…</p> : null}
      {trails.isError ? (
        <p>
          The map is unavailable right now.
          {trails.error instanceof ApiError ? ` ${trails.error.message}` : ''}
        </p>
      ) : null}
      {trails.data && trails.data.items.length === 0 ? <p>No trails are on the map yet.</p> : null}
      {trails.data && trails.data.items.length > 0 ? <TrailMap trails={trails.data.items} /> : null}
      <ul className="space-y-2">
        {trails.data?.items.map((trail) => (
          <li key={trail.slug}>
            <Link to={`/trails/${trail.slug}`}>{trail.name}</Link>
            {trail.summary ? <span className="text-muted"> — {trail.summary}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
