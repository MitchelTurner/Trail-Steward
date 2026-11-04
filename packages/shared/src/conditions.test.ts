import { describe, expect, it, vi } from 'vitest';
import { evaluate, type Cond } from './conditions';

describe('evaluate', () => {
  const answers = {
    landTypes: ['usfs', 'private'],
    stage: 'idea',
    match: 'no',
    community: 'Sitka',
  };

  it('matches a multi-select value', () => {
    expect(evaluate({ q: 'landTypes', includes: 'usfs' }, answers)).toBe(true);
    expect(evaluate({ q: 'landTypes', includes: 'nps' }, answers)).toBe(false);
  });

  it('matches a single-select value against a list', () => {
    expect(evaluate({ q: 'stage', in: ['idea', 'planned'] }, answers)).toBe(true);
    expect(evaluate({ q: 'stage', in: ['permitted'] }, answers)).toBe(false);
  });

  it('combines all, any, and not', () => {
    const cond: Cond = {
      all: [
        {
          any: [
            { q: 'landTypes', includes: 'usfs' },
            { q: 'landTypes', includes: 'nps' },
          ],
        },
        { not: { q: 'match', in: ['yes'] } },
      ],
    };
    expect(evaluate(cond, answers)).toBe(true);
  });

  it('returns false and warns for an unknown question id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(evaluate({ q: 'federalFunding', includes: 'yes' }, answers)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns false when the answer has the wrong shape', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(evaluate({ q: 'stage', includes: 'idea' }, answers)).toBe(false);
    expect(evaluate({ q: 'landTypes', in: ['usfs'] }, answers)).toBe(false);
    warn.mockRestore();
  });
});
