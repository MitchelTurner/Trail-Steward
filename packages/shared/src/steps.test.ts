import { describe, expect, it } from 'vitest';
import type { Cond } from './conditions';
import { selectSteps, type StepLike } from './steps';

type FixtureStep = StepLike & { title: string };

const always = null;

function step(
  key: string,
  sortOrder: number,
  prerequisiteKeys: string[],
  showIf: Cond | null,
): FixtureStep {
  return { key, sortOrder, prerequisiteKeys, showIf, title: key };
}

const steps: FixtureStep[] = [
  step('confirm-land', 1, [], always),
  step('check-plan', 2, ['confirm-land'], { q: 'stage', in: ['idea'] }),
  step('approvals', 3, ['confirm-land'], always),
  step('federal-review', 4, ['approvals'], {
    any: [
      { q: 'landTypes', includes: 'usfs' },
      { q: 'landTypes', includes: 'nps' },
      { q: 'federalFunding', in: ['yes', 'unknown'] },
    ],
  }),
  step('wetlands', 5, ['confirm-land'], { q: 'stage', in: ['idea', 'planned', 'designed'] }),
  step('tribal-g2g', 6, ['confirm-land'], {
    any: [
      { q: 'landTypes', includes: 'tribal' },
      { q: 'landTypes', includes: 'corporation' },
    ],
  }),
  step('maintenance-owner', 7, [], always),
  step('pick-program', 8, ['check-plan'], always),
  step('match', 9, ['pick-program'], { q: 'match', in: ['no', 'partial', 'unknown'] }),
  step('evidence', 10, [], always),
  step('partners', 11, [], always),
  step(
    'apply',
    12,
    [
      'confirm-land',
      'check-plan',
      'approvals',
      'federal-review',
      'wetlands',
      'tribal-g2g',
      'maintenance-owner',
      'pick-program',
      'match',
      'evidence',
      'partners',
    ],
    always,
  ),
];

function keys(answers: Record<string, unknown>): string[] {
  return selectSteps(steps, answers).map((item) => item.key);
}

describe('funding pathway step selection', () => {
  it('includes federal review for national forest land and skips match when match is yes', () => {
    expect(
      keys({
        community: 'Juneau',
        landTypes: ['usfs'],
        stage: 'planned',
        match: 'yes',
        federalFunding: 'no',
      }),
    ).toEqual([
      'confirm-land',
      'approvals',
      'federal-review',
      'wetlands',
      'maintenance-owner',
      'pick-program',
      'evidence',
      'partners',
      'apply',
    ]);
  });

  it('includes tribal contact and the plan check for an idea on tribal land', () => {
    expect(
      keys({
        community: 'Hoonah',
        landTypes: ['tribal'],
        stage: 'idea',
        match: 'yes',
        federalFunding: 'no',
      }),
    ).toEqual([
      'confirm-land',
      'check-plan',
      'approvals',
      'wetlands',
      'tribal-g2g',
      'maintenance-owner',
      'pick-program',
      'evidence',
      'partners',
      'apply',
    ]);
  });

  it('includes the match step when local match is missing', () => {
    expect(
      keys({
        community: 'Craig',
        landTypes: ['local'],
        stage: 'designed',
        match: 'no',
        federalFunding: 'no',
      }),
    ).toEqual([
      'confirm-land',
      'approvals',
      'wetlands',
      'maintenance-owner',
      'pick-program',
      'match',
      'evidence',
      'partners',
      'apply',
    ]);
  });

  it('includes federal review for a city trail that is asking for federal funding', () => {
    expect(
      keys({
        community: 'Juneau',
        landTypes: ['local'],
        stage: 'permitted',
        match: 'yes',
        federalFunding: 'yes',
      }),
    ).toEqual([
      'confirm-land',
      'approvals',
      'federal-review',
      'maintenance-owner',
      'pick-program',
      'evidence',
      'partners',
      'apply',
    ]);
  });

  it('includes federal review when federal funding is not sure yet', () => {
    expect(
      keys({
        community: 'Ketchikan',
        landTypes: ['local'],
        stage: 'permitted',
        match: 'yes',
        federalFunding: 'unknown',
      }),
    ).toContain('federal-review');
  });

  it('drops plan, wetlands, federal, tribal, and match steps when the project is permitted on a state park', () => {
    expect(
      keys({
        community: 'Sitka',
        landTypes: ['state-parks'],
        stage: 'permitted',
        match: 'yes',
        federalFunding: 'no',
      }),
    ).toEqual([
      'confirm-land',
      'approvals',
      'maintenance-owner',
      'pick-program',
      'evidence',
      'partners',
      'apply',
    ]);
  });
});
