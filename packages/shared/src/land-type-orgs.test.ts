import { describe, expect, it } from 'vitest';
import { landTypeNeedles, orgMatchesNeedles } from './land-type-orgs';

describe('land type organization matching', () => {
  it('does not filter when the answer is unknown or empty', () => {
    expect(landTypeNeedles(['unknown'])).toEqual({ filter: false, needles: [] });
    expect(landTypeNeedles([])).toEqual({ filter: false, needles: [] });
  });

  it('unions needles and ignores unknown', () => {
    const result = landTypeNeedles(['usfs', 'unknown', 'tribal']);
    expect(result.filter).toBe(true);
    expect(result.needles).toContain('USDA Forest Service');
    expect(result.needles).toContain('Metlakatla');
  });

  it('matches short names and longer legal names', () => {
    expect(
      orgMatchesNeedles({ name: 'USDA Forest Service, Tongass National Forest' }, [
        'USDA Forest Service',
      ]),
    ).toBe(true);
    expect(
      orgMatchesNeedles({ name: 'Alaska DNR, Division of Parks', shortName: 'DNR Parks' }, [
        'DNR Parks',
      ]),
    ).toBe(true);
    expect(orgMatchesNeedles({ name: 'Trail Mix' }, ['DNR Parks'])).toBe(false);
  });
});
