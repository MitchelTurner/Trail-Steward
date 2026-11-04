import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('builds topic slugs from sheet names', () => {
    expect(slugify('Workforce Dev. & Training')).toBe('workforce-dev-training');
    expect(slugify('Jurisdiction & Land Management')).toBe('jurisdiction-land-management');
    expect(slugify('Governance')).toBe('governance');
  });
});
