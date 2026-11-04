/** Web Mercator tiles for the public trail map. Esri's y index comes before x. */

export type MapBounds = { west: number; east: number; south: number; north: number };

export type MapTile = {
  z: number;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
  url: string;
};

export function mercatorY(lat: number): number {
  const clamped = Math.max(-85, Math.min(85, lat));
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

export function project(
  lng: number,
  lat: number,
  bounds: MapBounds,
  width: number,
  height: number,
): { x: number; y: number } {
  const north = mercatorY(bounds.north);
  const south = mercatorY(bounds.south);
  return {
    x: ((lng - bounds.west) / (bounds.east - bounds.west)) * width,
    y: ((north - mercatorY(lat)) / (north - south)) * height,
  };
}

export function mapFrame(bounds: MapBounds, width = 800): { width: number; height: number } {
  const xSpan = Math.max(bounds.east - bounds.west, 1e-6);
  const ySpan = mercatorY(bounds.north) - mercatorY(bounds.south);
  let height = (width * ySpan) / (xSpan * (Math.PI / 180));
  if (!Number.isFinite(height) || height < 200) height = 200;
  if (height > 920) {
    const scale = 920 / height;
    return { width: Math.round(width * scale), height: 920 };
  }
  return { width, height: Math.round(height) };
}

function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}

export function tileLon(x: number, zoom: number): number {
  return (x / 2 ** zoom) * 360 - 180;
}

export function tileLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** zoom;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function chooseZoom(bounds: MapBounds): number {
  const span = Math.max(bounds.east - bounds.west, 0.004);
  let zoom = Math.round(Math.log2((3.2 * 360) / span));
  zoom = Math.min(15, Math.max(4, zoom));
  while (zoom > 4) {
    const xCount =
      Math.floor(lonToTileX(bounds.east, zoom)) - Math.floor(lonToTileX(bounds.west, zoom)) + 1;
    const yCount =
      Math.floor(latToTileY(bounds.south, zoom)) - Math.floor(latToTileY(bounds.north, zoom)) + 1;
    if (xCount * yCount <= 18) break;
    zoom -= 1;
  }
  return zoom;
}

export function topoTileUrl(zoom: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${zoom}/${y}/${x}`;
}

export function mapTiles(bounds: MapBounds, frame: { width: number; height: number }): MapTile[] {
  const zoom = chooseZoom(bounds);
  const max = 2 ** zoom;
  const x0 = Math.max(0, Math.floor(lonToTileX(bounds.west, zoom)));
  const x1 = Math.min(max - 1, Math.floor(lonToTileX(bounds.east, zoom)));
  const y0 = Math.max(0, Math.floor(latToTileY(bounds.north, zoom)));
  const y1 = Math.min(max - 1, Math.floor(latToTileY(bounds.south, zoom)));
  const tiles: MapTile[] = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const nw = project(tileLon(x, zoom), tileLat(y, zoom), bounds, frame.width, frame.height);
      const se = project(
        tileLon(x + 1, zoom),
        tileLat(y + 1, zoom),
        bounds,
        frame.width,
        frame.height,
      );
      tiles.push({
        z: zoom,
        x,
        y,
        left: nw.x,
        top: nw.y,
        width: se.x - nw.x,
        height: se.y - nw.y,
        url: topoTileUrl(zoom, x, y),
      });
    }
  }
  return tiles;
}
