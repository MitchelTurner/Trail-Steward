import type { OrgKind } from '@prisma/client';

const GROUP_PREFIXES = [
  'Local governments',
  'Village corporations',
  'Tribal governments',
  'Private property owners',
  'Community trail nonprofits',
  'Outdoor recreation and tourism businesses',
  'Southeast Alaska Tourism Council and local visitor bureaus',
];

const KIND_RULES: { needle: string; kind: OrgKind }[] = [
  { needle: 'tribal government', kind: 'TRIBAL_GOVERNMENT' },
  { needle: 'village corporation', kind: 'NATIVE_CORPORATION' },
  { needle: 'past nonprofit network', kind: 'NONPROFIT' },
  { needle: 'nonprofit', kind: 'NONPROFIT' },
  { needle: 'coalition', kind: 'COALITION' },
  { needle: 'regional organization', kind: 'REGIONAL_ORG' },
  { needle: 'regional partnership', kind: 'REGIONAL_ORG' },
  { needle: 'state advisory body', kind: 'ADVISORY_BODY' },
  { needle: 'private business', kind: 'BUSINESS' },
  { needle: 'state land trust', kind: 'STATE_LAND_TRUST' },
  { needle: 'local government', kind: 'LOCAL_GOVERNMENT' },
  { needle: 'university', kind: 'UNIVERSITY' },
  { needle: 'federal', kind: 'FEDERAL' },
  { needle: 'state', kind: 'STATE' },
  { needle: 'private', kind: 'PRIVATE_LANDOWNER' },
];

export function isGroupName(name: string): boolean {
  const trimmed = name.trim().toLowerCase();
  return GROUP_PREFIXES.some((prefix) => trimmed.startsWith(prefix.toLowerCase()));
}

export function inferOrgKind(qualifier: string | null): { kind: OrgKind; warning?: string } {
  if (!qualifier || !qualifier.trim()) {
    return { kind: 'OTHER', warning: 'missing jurisdiction qualifier' };
  }
  const q = qualifier.trim().toLowerCase();
  for (const rule of KIND_RULES) {
    if (q === rule.needle || q.includes(rule.needle)) return { kind: rule.kind };
  }
  return { kind: 'OTHER', warning: `unknown kind for (${qualifier})` };
}

export function inferResourceKind(title: string): string {
  const text = title.toLowerCase();
  if (text.includes('plan')) return 'plan';
  if (text.includes('permit')) return 'permit';
  if (text.includes('program') || text.includes('fund')) return 'grant';
  if (text.includes('map') || text.includes('hub') || text.includes('data')) return 'data';
  return 'guide';
}

export type ParsedRoleLabel = {
  roleTypeNames: string[];
  roleQualifier: string | null;
  isDocumented: boolean;
  hasRole: boolean;
  unmatched: string[];
};

export function splitRolePhrase(phrase: string): string[] {
  const normalized = phrase.replace(/,?\s+and\s+/gi, ', ');
  return normalized
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function parseRoleLabel(label: string, roleTypeNames: string[]): ParsedRoleLabel {
  const trimmed = label.trim();
  const isDocumented = !/^role not yet documented/i.test(trimmed);
  const hasRole = !/^no\b.*\brole\b/i.test(trimmed);

  let roleQualifier: string | null = null;
  let body = trimmed;
  const qualifierMatch = body.match(/\(([^()]*)\)\s*$/);
  if (qualifierMatch && qualifierMatch.index !== undefined) {
    roleQualifier = qualifierMatch[1]?.trim() || null;
    body = body.slice(0, qualifierMatch.index).trim();
  }

  if (!isDocumented || !hasRole) {
    return { roleTypeNames: [], roleQualifier, isDocumented, hasRole, unmatched: [] };
  }

  const exact = roleTypeNames.find((name) => name.toLowerCase() === body.toLowerCase());
  if (exact) {
    return { roleTypeNames: [exact], roleQualifier, isDocumented, hasRole, unmatched: [] };
  }

  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const candidate of splitRolePhrase(body)) {
    const found = roleTypeNames.find((name) => name.toLowerCase() === candidate.toLowerCase());
    if (found) matched.push(found);
    else if (candidate) unmatched.push(candidate);
  }
  return { roleTypeNames: matched, roleQualifier, isDocumented, hasRole, unmatched };
}
