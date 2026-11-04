import { Link } from 'react-router-dom';
import { ASSET_KIND_LABELS, assetKinds } from 'shared/kinds';
import { mapFrame, mapTiles, project } from './map-tiles';

function kindName(kind: string): string {
  if ((assetKinds as readonly string[]).includes(kind)) {
    return ASSET_KIND_LABELS[kind as (typeof assetKinds)[number]];
  }
  return kind;
}

export type MapPoint = { type: 'Point'; coordinates: [number, number] };
export type MapLine = { type: 'LineString'; coordinates: [number, number][] };

export type MapTrail = {
  slug: string;
  name: string;
  line: MapLine | null;
  assets: { id: string; name: string; kind: string; point: MapPoint | null }[];
};

type Bounds = { west: number; east: number; south: number; north: number };

const DEFAULT_BOUNDS: Bounds = { west: -138, east: -130, south: 54, north: 60 };

export function boundsFor(trails: MapTrail[]): Bounds {
  const coords: [number, number][] = [];
  for (const trail of trails) {
    if (trail.line) coords.push(...trail.line.coordinates);
    for (const asset of trail.assets) {
      if (asset.point) coords.push(asset.point.coordinates);
    }
  }
  if (coords.length === 0) return DEFAULT_BOUNDS;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lng, lat] of coords) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const padX = Math.max((east - west) * 0.08, 0.05);
  const padY = Math.max((north - south) * 0.08, 0.05);
  return { west: west - padX, east: east + padX, south: south - padY, north: north + padY };
}

export function TrailMap({ trails }: { trails: MapTrail[] }) {
  const bounds = boundsFor(trails);
  const frame = mapFrame(bounds);
  const tiles = mapTiles(bounds, frame);
  return (
    <figure className="space-y-1">
      <svg
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role="img"
        aria-label="Map of trails"
        className="w-full rounded border border-line bg-[#d7e6f2]"
      >
        {tiles.map((tile) => (
          <image
            key={`${tile.z}-${tile.x}-${tile.y}`}
            href={tile.url}
            x={tile.left}
            y={tile.top}
            width={tile.width}
            height={tile.height}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
        ))}
        {trails.map((trail) => {
          if (!trail.line) return null;
          const points = trail.line.coordinates
            .map(([lng, lat]) => {
              const spot = project(lng, lat, bounds, frame.width, frame.height);
              return `${spot.x},${spot.y}`;
            })
            .join(' ');
          return (
            <Link key={trail.slug} to={`/trails/${trail.slug}`}>
              <polyline
                points={points}
                fill="none"
                stroke="#ffffff"
                strokeWidth={8}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={points}
                fill="none"
                stroke="#1b365d"
                strokeWidth={4}
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                <title>{trail.name}</title>
              </polyline>
            </Link>
          );
        })}
        {trails.flatMap((trail) =>
          trail.assets.map((asset) => {
            if (!asset.point) return null;
            const spot = project(
              asset.point.coordinates[0],
              asset.point.coordinates[1],
              bounds,
              frame.width,
              frame.height,
            );
            return (
              <Link key={asset.id} to={`/trails/${trail.slug}`}>
                <circle
                  cx={spot.x}
                  cy={spot.y}
                  r={7}
                  fill="#1f6b4a"
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  <title>
                    {asset.name} ({kindName(asset.kind)})
                  </title>
                </circle>
              </Link>
            );
          }),
        )}
      </svg>
      <figcaption className="text-sm text-muted">
        Map image from{' '}
        <a href="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer">
          Esri World Topographic Map
        </a>
        . Sources: Esri, USGS, NOAA, and OpenStreetMap contributors.
      </figcaption>
    </figure>
  );
}
