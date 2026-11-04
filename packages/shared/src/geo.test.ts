import { describe, expect, it } from 'vitest';
import { lineStringSchema, pointSchema } from './geo';

describe('map geometry', () => {
  it('accepts a trail line and a point', () => {
    expect(
      lineStringSchema.parse({
        type: 'LineString',
        coordinates: [
          [-135.3, 57.05],
          [-135.2, 57.1],
        ],
      }).coordinates,
    ).toHaveLength(2);
    expect(pointSchema.parse({ type: 'Point', coordinates: [-135.3, 57.05] }).type).toBe('Point');
  });

  it('rejects a line with one point and a latitude past the pole', () => {
    expect(lineStringSchema.safeParse({ type: 'LineString', coordinates: [[-135, 57]] }).success).toBe(
      false,
    );
    expect(pointSchema.safeParse({ type: 'Point', coordinates: [-135, 95] }).success).toBe(false);
  });
});
