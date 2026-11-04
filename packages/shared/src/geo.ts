import { z } from 'zod';

const position = z.tuple([
  z.number().gte(-180).lte(180),
  z.number().gte(-90).lte(90),
]);

export const lineStringSchema = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(position).min(2).max(5000),
});

export const pointSchema = z.object({
  type: z.literal('Point'),
  coordinates: position,
});

export type LineString = z.infer<typeof lineStringSchema>;
export type GeoPoint = z.infer<typeof pointSchema>;
