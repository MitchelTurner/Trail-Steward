import ExcelJS from 'exceljs';

/**
 * Synthetic workbook with the same layout as Southeast Conference's Trail Coordination Guide.
 * It is not the official guide. Drop the real file at data/SEC_Trail_Coordination_Guide_Draft_V2.xlsx
 * to import that instead. Pathway text below cites only facts that appear in this workbook.
 */

export type FixtureTopic = {
  sheet: string;
  name: string;
  question: string;
  learnings: { heading: string; body: string }[];
  roleTypes: { name: string; definition: string }[];
  defaultLabel: string;
};

export type FixturePlayer = {
  name: string;
  qualifier: string;
  website?: string;
  skipSheets?: string[];
  undocumentedSheets?: string[];
  noRoleSheets?: string[];
  labels?: Record<string, string>;
};

export type FixtureResource = {
  player: string;
  sheet: string;
  title: string;
  url: string;
  resourcesText?: string;
  needsText?: string;
};

export const FIXTURE_TOPICS: FixtureTopic[] = [
  {
    sheet: 'Jurisdiction & Land Management',
    name: 'Jurisdiction & Land Management',
    question: 'Who owns, manages, or has authority over trail land?',
    defaultLabel: 'Landowner and land manager',
    learnings: [
      {
        heading: 'Three offices',
        body: 'The owner, the manager, and the office that approves a permit can be three different offices.',
      },
      {
        heading: 'Seeing ownership',
        body: 'The state recreation data hub shows land ownership.',
      },
      {
        heading: 'Access without ownership',
        body: 'Trails can be built through access agreements without owning the land.',
      },
    ],
    roleTypes: [
      { name: 'Landowner', definition: 'Holds title to the land the trail crosses.' },
      {
        name: 'Land manager',
        definition: 'Manages the land day to day, even when someone else holds title.',
      },
      { name: 'Easement manager', definition: 'Manages a recorded right of access across land.' },
    ],
  },
  {
    sheet: 'Permitting & Land Access',
    name: 'Permitting & Land Access',
    question: 'What approvals does a trail need before it can be built?',
    defaultLabel: 'Permit issuer',
    learnings: [
      {
        heading: 'Several approvals',
        body: 'One trail can need 3–4 approvals.',
      },
      {
        heading: 'Slow easements',
        body: 'DNR Mining, Land and Water easements can take years.',
      },
      {
        heading: 'Roads and streams',
        body: 'DOT&PF permits encroachments in highway rights of way. ADF&G issues fish habitat permits for stream crossings.',
      },
      {
        heading: 'Federal review',
        body: 'A Skagway trail on Forest Service land stalled on environmental review. Design to construction on the Tongass can run 5+ years.',
      },
    ],
    roleTypes: [
      {
        name: 'Permit issuer',
        definition: 'Issues a permit, easement, or other approval for trail work.',
      },
      { name: 'Reviewer', definition: 'Reviews an application before another office decides.' },
    ],
  },
  {
    sheet: 'Planning & Prioritization',
    name: 'Planning & Prioritization',
    question: 'Is this trail in a plan the community and agencies have signed?',
    defaultLabel: 'Plan partner',
    learnings: [
      {
        heading: 'Signed plans',
        body: 'A jointly signed plan gives an edge in grant applications.',
      },
      {
        heading: 'Examples',
        body: 'Examples include the 2023 Sitka Trail Plan and the Wrangell 2012 plan with its signed partner agreement.',
      },
    ],
    roleTypes: [
      { name: 'Plan author', definition: 'Writes or adopts the plan that lists the trail.' },
      { name: 'Plan partner', definition: 'Signs the plan or agrees to carry out part of it.' },
    ],
  },
  {
    sheet: 'Funding & Grants',
    name: 'Funding & Grants',
    question: 'Which funding programs can pay for this trail, and what match do they require?',
    defaultLabel: 'Funder and applicant',
    learnings: [
      {
        heading: 'Programs',
        body: 'Land and Water Conservation Fund grants are run by DNR and scored against the state recreation plan. The Multi-Use Trails Program is run by DOT&PF and has been open since October 1, 2025. Tribes can use the Tribal Transportation Program. The Federal Lands Access Program has funded the Sitka Cross Trail. The Tongass Stewardship Fund supports maintenance.',
      },
      {
        heading: 'Match',
        body: 'Most construction grants require a match. The Forest Service ended its match waiver. Tribal Transportation Program funds can match other federal highway funds. Juneau and Trail Mix are examples of local capital funding.',
      },
    ],
    roleTypes: [
      { name: 'Funder', definition: 'Provides grant or program funds.' },
      {
        name: 'Grant administrator',
        definition: 'Runs the grant program and the application cycle.',
      },
      { name: 'Grant reviewer', definition: 'Scores or comments on applications.' },
      { name: 'Applicant', definition: 'Applies for funds or sponsors an application.' },
    ],
  },
  {
    sheet: 'Construction & Maintenance',
    name: 'Construction & Maintenance',
    question: 'Who will build the trail and keep it in good shape?',
    defaultLabel: 'Maintenance owner',
    learnings: [
      {
        heading: 'Workshop warning',
        body: 'The regional workshop’s strongest warning was that many trails have no clear maintenance owner.',
      },
      {
        heading: 'A standing contract',
        body: 'Wrangell’s standing contract with its Tribe is an example of naming a maintenance owner.',
      },
    ],
    roleTypes: [
      {
        name: 'Maintenance owner',
        definition: 'Maintains, inspects, and repairs the trail after it is built.',
      },
      { name: 'Builder', definition: 'Builds or reconstructs the trail.' },
    ],
  },
  {
    sheet: 'Promotion & Visitor Info',
    name: 'Promotion & Visitor Info',
    question: 'How will visitors find the trail and know if it is open?',
    defaultLabel: 'Visitor information lead',
    learnings: [
      {
        heading: 'Tell people it is open',
        body: 'Visitors need a current description and a way to know when the trail is closed.',
      },
    ],
    roleTypes: [
      {
        name: 'Visitor information lead',
        definition: 'Publishes directions, conditions, and closures for visitors.',
      },
    ],
  },
  {
    sheet: 'Data Stewardship',
    name: 'Data Stewardship',
    question: 'What counts, maps, and records show that people need this trail?',
    defaultLabel: 'Data steward',
    learnings: [
      {
        heading: 'Counts and use',
        body: 'Skagway uses trail counters. DNR has a cell-data pilot. The Forest Service can share cabin occupancy data.',
      },
    ],
    roleTypes: [
      { name: 'Data steward', definition: 'Keeps counts, maps, or other records about trail use.' },
    ],
  },
  {
    sheet: 'Convening & Coordinating',
    name: 'Convening & Coordinating',
    question: 'Who brings the partners together and can hold a grant?',
    defaultLabel: 'Convener',
    learnings: [
      {
        heading: 'Who holds the grant',
        body: 'Sitka Trail Works and Trail Mix manage grants for their communities. Southeast Conference can act as a pass-through.',
      },
    ],
    roleTypes: [
      { name: 'Convener', definition: 'Brings partners together and keeps the work moving.' },
      {
        name: 'Pass-through sponsor',
        definition: 'Holds a grant on behalf of a community or partnership.',
      },
    ],
  },
  {
    sheet: 'Safety & Education',
    name: 'Safety & Education',
    question: 'How will people learn to use the trail safely?',
    defaultLabel: 'Educator',
    learnings: [
      {
        heading: 'Safety messages',
        body: 'Partners can share safety messages for weather, wildlife, and trail conditions.',
      },
    ],
    roleTypes: [{ name: 'Educator', definition: 'Teaches safe use of trails and outdoor skills.' }],
  },
  {
    sheet: 'Platform Creation & Hosting',
    name: 'Platform Creation & Hosting',
    question: 'Where does trail information live online?',
    defaultLabel: 'Platform host',
    learnings: [
      {
        heading: 'One public home',
        body: 'A shared page or map helps people find the same trail facts.',
      },
    ],
    roleTypes: [
      {
        name: 'Platform host',
        definition: 'Hosts a website, map, or other public trail platform.',
      },
    ],
  },
  {
    sheet: 'Workforce Dev. & Training',
    name: 'Workforce Dev. & Training',
    question: 'Who can train and hire people to build and maintain trails?',
    defaultLabel: 'Trainer',
    learnings: [
      {
        heading: 'Crews',
        body: 'Training programs and local crews are how small communities get trail work done.',
      },
    ],
    roleTypes: [
      { name: 'Trainer', definition: 'Trains people to build, inspect, or maintain trails.' },
    ],
  },
  {
    sheet: 'Governance',
    name: 'Governance',
    question: 'Who decides, and how are agreements kept over time?',
    defaultLabel: 'Decision body',
    learnings: [
      {
        heading: 'Governments',
        body: 'Tribal governments have standing as governments.',
      },
      {
        heading: 'Lasting agreements',
        body: 'Lasting agreements beat one-time agreements. Mendenhall co-stewardship is one example.',
      },
    ],
    roleTypes: [
      { name: 'Decision body', definition: 'Makes or confirms the decision to proceed.' },
      { name: 'Government', definition: 'Acts with the standing of a government.' },
    ],
  },
];

export const FIXTURE_PLAYERS: FixturePlayer[] = [
  { name: 'USDA Forest Service', qualifier: 'federal', website: 'https://www.fs.usda.gov/tongass' },
  {
    name: 'National Park Service',
    qualifier: 'federal',
    website: 'https://www.nps.gov/state/ak/index.htm',
  },
  {
    name: 'Bureau of Land Management',
    qualifier: 'federal',
    website: 'https://www.blm.gov/alaska',
  },
  { name: 'DNR Parks', qualifier: 'state', website: 'https://dnr.alaska.gov/parks' },
  {
    name: 'DNR Mining, Land and Water',
    qualifier: 'state',
    website: 'https://dnr.alaska.gov/mlw',
  },
  {
    name: 'DOT&PF',
    qualifier: 'state',
    website: 'https://dot.alaska.gov',
    labels: { 'Funding & Grants': 'Grant administrator, funder, and applicant' },
  },
  { name: 'ADF&G', qualifier: 'state', website: 'https://www.adfg.alaska.gov' },
  {
    name: 'Alaska Mental Health Trust',
    qualifier: 'state land trust',
    website: 'https://alaskamentalhealthtrust.org',
  },
  { name: 'Recreational Trails Program Advisory Board', qualifier: 'state advisory body' },
  {
    name: 'University of Alaska Southeast',
    qualifier: 'university',
    website: 'https://uas.alaska.edu',
    undocumentedSheets: ['Promotion & Visitor Info'],
  },
  { name: 'Local governments', qualifier: 'local government' },
  {
    name: 'City and Borough of Juneau',
    qualifier: 'local government',
    website: 'https://juneau.org',
  },
  {
    name: 'Haines Borough',
    qualifier: 'local government',
    website: 'https://www.hainesalaska.gov',
    skipSheets: ['Platform Creation & Hosting'],
  },
  { name: 'Tribal governments', qualifier: 'tribal government' },
  {
    name: 'Central Council of the Tlingit & Haida Indian Tribes of Alaska',
    qualifier: 'tribal government',
    website: 'https://www.ccthita.org',
  },
  {
    name: 'Metlakatla Indian Community',
    qualifier: 'tribal government',
    website: 'https://www.metlakatla.com',
  },
  { name: 'Village corporations', qualifier: 'village corporation' },
  {
    name: 'Shee Atiká, Incorporated',
    qualifier: 'village corporation',
    website: 'https://www.sheeatika.com',
  },
  { name: 'Private property owners', qualifier: 'private' },
  { name: 'Community trail nonprofits', qualifier: 'nonprofit' },
  { name: 'Sitka Trail Works', qualifier: 'nonprofit', website: 'https://www.sitkatrailworks.org' },
  { name: 'Trail Mix', qualifier: 'nonprofit', website: 'https://www.trailmixinc.org' },
  {
    name: 'Southeast Alaska Watershed Coalition',
    qualifier: 'coalition',
    website: 'https://www.alaskawatershedcoalition.org',
  },
  {
    name: 'Southeast Conference',
    qualifier: 'regional organization',
    website: 'https://www.seconference.org',
    labels: { 'Convening & Coordinating': 'Convener and pass-through sponsor' },
  },
  {
    name: 'Southeast Alaska Tourism Council and local visitor bureaus',
    qualifier: 'regional partnership',
  },
  { name: 'Outdoor recreation and tourism businesses', qualifier: 'private business' },
  { name: 'Alaska Trails', qualifier: 'nonprofit', website: 'https://www.alaska-trails.org' },
  {
    name: 'Sitka Conservation Society',
    qualifier: 'nonprofit',
    website: 'https://sitkawild.org',
    skipSheets: ['Workforce Dev. & Training'],
  },
  {
    name: 'The Nature Conservancy of Alaska',
    qualifier: 'nonprofit',
    website: 'https://www.nature.org/alaska',
    noRoleSheets: ['Permitting & Land Access'],
  },
];

export const FIXTURE_RESOURCES: FixtureResource[] = [
  {
    player: 'DNR Parks',
    sheet: 'Jurisdiction & Land Management',
    title: 'State recreation data hub',
    url: 'https://dnr.alaska.gov/parks/asp/recreation-data',
    resourcesText: 'Use the state recreation data hub to see land ownership.',
  },
  {
    player: 'DNR Mining, Land and Water',
    sheet: 'Jurisdiction & Land Management',
    title: 'Public access and RS 2477 trails',
    url: 'https://dnr.alaska.gov/mlw/trails/rs2477',
    resourcesText: 'Public access and RS 2477 notes for historic trails.',
  },
  {
    player: 'DOT&PF',
    sheet: 'Permitting & Land Access',
    title: 'DOT&PF right-of-way and permits',
    url: 'https://dot.alaska.gov/row-permits',
    resourcesText: 'Permits for work in a state highway right of way.',
  },
  {
    player: 'ADF&G',
    sheet: 'Permitting & Land Access',
    title: 'Fish habitat permit application (PDF)',
    url: 'https://www.adfg.alaska.gov/static/fish-habitat-permit.pdf',
    resourcesText: 'Fish habitat permit for a stream crossing.',
  },
  {
    player: 'Sitka Trail Works',
    sheet: 'Planning & Prioritization',
    title: '2023 Sitka Trail Plan (PDF)',
    url: 'https://www.cityofsitka.org/media/sitka-trail-plan-2023.pdf',
    resourcesText: '2023 Sitka Trail Plan.',
  },
  {
    player: 'DOT&PF',
    sheet: 'Funding & Grants',
    title: 'Multi-Use Trails Program',
    url: 'https://dot.alaska.gov/multi-use-trails',
    resourcesText: 'Multi-Use Trails Program, open since October 1, 2025.',
  },
  {
    player: 'USDA Forest Service',
    sheet: 'Funding & Grants',
    title: 'Tongass Stewardship Fund: get involved',
    url: 'https://www.fs.usda.gov/tongass-stewardship-fund',
    resourcesText: 'Tongass Stewardship Fund for maintenance.',
    needsText: 'Maintenance funding still needs a local sponsor.',
  },
];

const TILE_ROWS = [17, 21, 25, 29];
const TILE_COLS = [2, 4, 6];

function labelFor(player: FixturePlayer, topic: FixtureTopic): string {
  if (player.noRoleSheets?.includes(topic.sheet)) return `No permitting role (${player.qualifier})`;
  if (player.undocumentedSheets?.includes(topic.sheet)) {
    return `Role not yet documented (${player.qualifier})`;
  }
  const phrase = player.labels?.[topic.sheet] ?? topic.defaultLabel;
  return `${phrase} (${player.qualifier})`;
}

export function buildFixtureWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const start = workbook.addWorksheet('Start Here');
  FIXTURE_TOPICS.forEach((topic, index) => {
    const row = TILE_ROWS[Math.floor(index / 3)] ?? 17;
    const col = TILE_COLS[index % 3] ?? 2;
    const link = `#'${topic.sheet}'!A1`;
    start.getCell(row, col).value = { text: topic.question, hyperlink: link };
    start.getCell(row + 1, col).value = { text: topic.name, hyperlink: link };
  });
  start.getCell('B35').value = 'Southeast Conference — trails@seconference.org — (907) 586-4360';

  for (const topic of FIXTURE_TOPICS) {
    const sheet = workbook.addWorksheet(topic.sheet);
    sheet.getCell('A1').value = topic.name;
    sheet.getCell('B2').value = topic.question;
    let row = 4;
    sheet.getCell(row, 2).value = 'What we learned';
    row += 1;
    for (const learning of topic.learnings) {
      sheet.getCell(row, 2).value = learning.heading;
      sheet.getCell(row, 3).value = learning.body;
      row += 1;
    }
    sheet.getCell(row, 2).value = 'Player types used on this page';
    row += 1;
    sheet.getCell(row, 2).value =
      'How to read a player type: the words name the role, and the parentheses name the kind of organization.';
    row += 1;
    for (const roleType of topic.roleTypes) {
      sheet.getCell(row, 2).value = roleType.name;
      sheet.getCell(row, 3).value = roleType.definition;
      row += 1;
    }
    sheet.getCell(row, 2).value = 'What each player shared';
    row += 1;
    sheet.getCell(row, 2).value = 'Player';
    sheet.getCell(row, 3).value = 'Player type';
    sheet.getCell(row, 4).value = 'Resources identified by the player';
    sheet.getCell(row, 5).value = 'Links to resources';
    sheet.getCell(row, 6).value = 'Needs identified by the player';
    row += 1;
    for (const player of FIXTURE_PLAYERS) {
      if (player.skipSheets?.includes(topic.sheet)) continue;
      const nameCell = sheet.getCell(row, 2);
      if (player.website) nameCell.value = { text: player.name, hyperlink: player.website };
      else nameCell.value = player.name;
      sheet.getCell(row, 3).value = labelFor(player, topic);
      const resource = FIXTURE_RESOURCES.find(
        (item) => item.player === player.name && item.sheet === topic.sheet,
      );
      if (resource) {
        if (resource.resourcesText) sheet.getCell(row, 4).value = resource.resourcesText;
        sheet.getCell(row, 5).value = { text: resource.title, hyperlink: resource.url };
        if (resource.needsText) sheet.getCell(row, 6).value = resource.needsText;
      }
      if (topic.sheet === 'Construction & Maintenance' && player.name === 'Tribal governments') {
        sheet.getCell(row, 6).value =
          'Many trails still need a maintenance owner. Wrangell’s standing contract with its Tribe is one way to name that owner.';
      }
      row += 1;
    }
    sheet.getCell(row, 2).value = '◀  Back to Start';
  }
  return workbook;
}

export async function writeFixtureFile(filePath: string): Promise<void> {
  const workbook = buildFixtureWorkbook();
  await workbook.xlsx.writeFile(filePath);
}
