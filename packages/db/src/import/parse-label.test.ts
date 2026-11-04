import { describe, expect, it } from 'vitest';
import { inferOrgKind, inferResourceKind, parseRoleLabel, splitRolePhrase } from './parse-label';

describe('parseRoleLabel', () => {
  const permitting = ['Permit issuer', 'Easement manager', 'Applicant'];

  it('splits a combined label and keeps the final qualifier', () => {
    const parsed = parseRoleLabel('Permit issuer and easement manager (federal)', permitting);
    expect(parsed.roleTypeNames).toEqual(['Permit issuer', 'Easement manager']);
    expect(parsed.roleQualifier).toBe('federal');
    expect(parsed.isDocumented).toBe(true);
    expect(parsed.hasRole).toBe(true);
    expect(parsed.unmatched).toEqual([]);
  });

  it('handles an oxford list', () => {
    const names = ['Grant administrator', 'Grant reviewer', 'Funder', 'Applicant'];
    const parsed = parseRoleLabel(
      'Grant administrator, grant reviewer, funder, and applicant (state)',
      names,
    );
    expect(parsed.roleTypeNames).toEqual(names);
    expect(parsed.roleQualifier).toBe('state');
  });

  it('marks undocumented and no-role labels', () => {
    expect(
      parseRoleLabel('Role not yet documented (Tribal government)', permitting).isDocumented,
    ).toBe(false);
    expect(parseRoleLabel('No permitting role (nonprofit)', permitting).hasRole).toBe(false);
  });

  it('reports unmatched pieces', () => {
    const parsed = parseRoleLabel('Harbor master (federal)', permitting);
    expect(parsed.unmatched).toEqual(['Harbor master']);
  });
});

describe('splitRolePhrase', () => {
  it('splits on commas and and', () => {
    expect(splitRolePhrase('Grant administrator, grant reviewer, funder, and applicant')).toEqual([
      'Grant administrator',
      'grant reviewer',
      'funder',
      'applicant',
    ]);
  });
});

describe('inferOrgKind', () => {
  it('maps jurisdiction qualifiers', () => {
    expect(inferOrgKind('federal').kind).toBe('FEDERAL');
    expect(inferOrgKind('state').kind).toBe('STATE');
    expect(inferOrgKind('Tribal government').kind).toBe('TRIBAL_GOVERNMENT');
    expect(inferOrgKind('village corporation, ANCSA').kind).toBe('NATIVE_CORPORATION');
    expect(inferOrgKind('past nonprofit network').kind).toBe('NONPROFIT');
    expect(inferOrgKind('coalition').kind).toBe('COALITION');
    expect(inferOrgKind('regional organization').kind).toBe('REGIONAL_ORG');
    expect(inferOrgKind('regional partnership').kind).toBe('REGIONAL_ORG');
    expect(inferOrgKind('state advisory body').kind).toBe('ADVISORY_BODY');
    expect(inferOrgKind('private business').kind).toBe('BUSINESS');
    expect(inferOrgKind('private').kind).toBe('PRIVATE_LANDOWNER');
    expect(inferOrgKind('state land trust').kind).toBe('STATE_LAND_TRUST');
    expect(inferOrgKind('university').kind).toBe('UNIVERSITY');
    expect(inferOrgKind('local government').kind).toBe('LOCAL_GOVERNMENT');
  });

  it('warns and falls back to OTHER', () => {
    const result = inferOrgKind('mystery office');
    expect(result.kind).toBe('OTHER');
    expect(result.warning).toMatch(/unknown kind/);
  });
});

describe('inferResourceKind', () => {
  it('classifies titles by keyword', () => {
    expect(inferResourceKind('2023 Sitka Trail Plan (PDF)')).toBe('plan');
    expect(inferResourceKind('Fish habitat permit application (PDF)')).toBe('permit');
    expect(inferResourceKind('Multi-Use Trails Program')).toBe('grant');
    expect(inferResourceKind('Tongass Stewardship Fund: get involved')).toBe('grant');
    expect(inferResourceKind('State recreation data hub')).toBe('data');
    expect(inferResourceKind('Public access and RS 2477 trails')).toBe('guide');
  });
});
