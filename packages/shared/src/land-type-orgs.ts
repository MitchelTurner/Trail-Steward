/** Names as they appear in the coordination guide. Match against organization name or short name. */
export const LAND_TYPE_ORG_MATCHES: Record<string, string[]> = {
  usfs: ['USDA Forest Service'],
  nps: ['National Park Service'],
  'state-parks': ['DNR Parks'],
  'state-general': ['DNR Mining, Land and Water'],
  'dot-row': ['DOT&PF'],
  local: ['Local governments'],
  tribal: ['Tribal governments', 'Tlingit & Haida', 'Metlakatla'],
  corporation: ['Village corporations'],
  trust: ['Alaska Mental Health Trust'],
  private: ['Private property owners'],
  unknown: [],
};

export const FALLBACK_ORG_MATCHES = ['Community trail nonprofits', 'Southeast Conference'];

export type OrgName = { name: string; shortName?: string | null };

export function orgHaystack(org: OrgName): string {
  return `${org.shortName ?? ''} ${org.name}`.toLowerCase();
}

export function orgMatchesNeedles(org: OrgName, needles: string[]): boolean {
  const hay = orgHaystack(org);
  return needles.some((needle) => hay.includes(needle.toLowerCase()));
}

/**
 * `unknown` adds no filter. If every selected type is unknown or empty, do not filter.
 * Otherwise keep organizations that match any selected land type.
 */
export function landTypeNeedles(selected: string[]): { filter: boolean; needles: string[] } {
  const types = selected.filter((type) => type !== 'unknown');
  if (types.length === 0) return { filter: false, needles: [] };
  const needles = types.flatMap((type) => LAND_TYPE_ORG_MATCHES[type] ?? []);
  return { filter: true, needles };
}
