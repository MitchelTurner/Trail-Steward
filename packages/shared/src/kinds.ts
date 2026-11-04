export const orgKinds = [
  'FEDERAL',
  'STATE',
  'LOCAL_GOVERNMENT',
  'TRIBAL_GOVERNMENT',
  'NATIVE_CORPORATION',
  'STATE_LAND_TRUST',
  'UNIVERSITY',
  'NONPROFIT',
  'COALITION',
  'REGIONAL_ORG',
  'ADVISORY_BODY',
  'BUSINESS',
  'PRIVATE_LANDOWNER',
  'OTHER',
] as const;

export const userRoles = ['EDITOR', 'COORDINATOR', 'ADMIN'] as const;
export const contentStatuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const linkStatuses = ['UNCHECKED', 'OK', 'REDIRECT', 'BROKEN'] as const;
export const suggestionStatuses = ['OPEN', 'ACCEPTED', 'REJECTED'] as const;
export const visibilities = ['PUBLIC', 'PARTNERS', 'PRIVATE'] as const;
export const assetKinds = ['TRAILHEAD', 'BRIDGE', 'CULVERT', 'SIGN', 'OTHER'] as const;
export const issueStatuses = ['OPEN', 'CLOSED'] as const;
export const workdayStatuses = ['PLANNED', 'DONE', 'CANCELED'] as const;
export const changeRequestStatuses = ['OPEN', 'ACCEPTED', 'REJECTED'] as const;
export const counterKinds = ['TRAIL', 'CABIN', 'OTHER'] as const;

export const COUNTER_KIND_LABELS: Record<(typeof counterKinds)[number], string> = {
  TRAIL: 'Trail counter',
  CABIN: 'Cabin count',
  OTHER: 'Other count',
};

export const ASSET_KIND_LABELS: Record<(typeof assetKinds)[number], string> = {
  TRAILHEAD: 'Trailhead',
  BRIDGE: 'Bridge',
  CULVERT: 'Culvert',
  SIGN: 'Sign',
  OTHER: 'Other',
};

export const ORG_KIND_LABELS: Record<(typeof orgKinds)[number], string> = {
  FEDERAL: 'Federal',
  STATE: 'State',
  LOCAL_GOVERNMENT: 'Local government',
  TRIBAL_GOVERNMENT: 'Tribal government',
  NATIVE_CORPORATION: 'Native corporation',
  STATE_LAND_TRUST: 'State land trust',
  UNIVERSITY: 'University',
  NONPROFIT: 'Nonprofit',
  COALITION: 'Coalition',
  REGIONAL_ORG: 'Regional organization',
  ADVISORY_BODY: 'Advisory body',
  BUSINESS: 'Business',
  PRIVATE_LANDOWNER: 'Private landowner',
  OTHER: 'Other',
};
