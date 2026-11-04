import assert from 'node:assert/strict';
import test from 'node:test';
import { mapFrame, mapTiles, project, tileLat, tileLon } from './src/features/map/map-tiles.ts';

const juneau = { west: -134.6, east: -134.3, south: 58.25, north: 58.45 };

test('the northwest corner of the frame is the northwest of the bounds', () => {
  const frame = mapFrame(juneau, 800);
  const nw = project(juneau.west, juneau.north, juneau, frame.width, frame.height);
  const se = project(juneau.east, juneau.south, juneau, frame.width, frame.height);
  assert.ok(Math.abs(nw.x) < 0.001);
  assert.ok(Math.abs(nw.y) < 0.001);
  assert.ok(Math.abs(se.x - frame.width) < 0.001);
  assert.ok(Math.abs(se.y - frame.height) < 0.001);
});

test('a place lands on the topographic tile that contains it', () => {
  const frame = mapFrame(juneau, 800);
  const tiles = mapTiles(juneau, frame);
  assert.ok(tiles.length >= 1);
  assert.ok(tiles.length <= 18);
  const spot = project(-134.42, 58.3, juneau, frame.width, frame.height);
  const hit = tiles.find(
    (tile) =>
      spot.x >= tile.left - 0.01 &&
      spot.x <= tile.left + tile.width + 0.01 &&
      spot.y >= tile.top - 0.01 &&
      spot.y <= tile.top + tile.height + 0.01,
  );
  assert.ok(hit);
  assert.equal(tileLon(hit.x, hit.z) <= -134.42, true);
  assert.equal(tileLon(hit.x + 1, hit.z) > -134.42, true);
  assert.equal(tileLat(hit.y, hit.z) >= 58.3, true);
  assert.equal(tileLat(hit.y + 1, hit.z) < 58.3, true);
  assert.match(hit.url, new RegExp(`/tile/${hit.z}/${hit.y}/${hit.x}$`));
});

test('Southeast Alaska stays a short list of tiles', () => {
  const region = { west: -136, east: -131, south: 55, north: 60 };
  const tiles = mapTiles(region, mapFrame(region));
  assert.ok(tiles.length >= 4);
  assert.ok(tiles.length <= 18);
  assert.equal(new Set(tiles.map((tile) => tile.url)).size, tiles.length);
});
