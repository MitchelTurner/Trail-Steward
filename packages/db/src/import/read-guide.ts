import ExcelJS from 'exceljs';
import { slugify } from 'shared';
import { cellHyperlink, cellText, httpUrl } from './cells';
import { inferOrgKind, inferResourceKind, isGroupName, parseRoleLabel } from './parse-label';
import type { OrgKind } from '@prisma/client';

const TILE_ROWS = [17, 21, 25, 29];
const TILE_COLS = [2, 4, 6];
const JURISDICTION_SHEET = 'Jurisdiction & Land Management';

export type GuideResource = {
  title: string;
  url: string;
  kind: string;
  ownerSlug: string;
};

export type GuideRole = {
  orgSlug: string;
  topicSlug: string;
  roleLabel: string;
  roleTypeNames: string[];
  roleQualifier: string | null;
  isDocumented: boolean;
  hasRole: boolean;
  resourcesText: string | null;
  needsText: string | null;
  resourceKeys: string[];
  sourceSheet: string;
  sourceRow: number;
};

export type GuideTopic = {
  slug: string;
  name: string;
  question: string;
  sortOrder: number;
  sheet: string;
  learnings: { heading: string; body: string; sortOrder: number }[];
  roleTypes: { name: string; definition: string; sortOrder: number }[];
};

export type GuideOrg = {
  slug: string;
  name: string;
  websiteUrl: string | null;
  isGroup: boolean;
  kind: OrgKind;
};

export type InterpretedGuide = {
  topics: GuideTopic[];
  orgs: GuideOrg[];
  roles: GuideRole[];
  resources: GuideResource[];
  warnings: string[];
  contactNote: string | null;
};

function sheetLinkName(link: string | null): string | null {
  if (!link || !link.startsWith('#')) return null;
  const match = link.match(/^#'?([^'!]+)'?!/i);
  return match?.[1]?.trim() ?? null;
}

function findLabelRow(sheet: ExcelJS.Worksheet, label: string): number | null {
  const target = label.trim().toLowerCase();
  let found: number | null = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (found != null) return;
    const text = cellText(row.getCell(2));
    if (text.toLowerCase() === target) found = rowNumber;
  });
  return found;
}

function resourcesFromCell(cell: ExcelJS.Cell): { title: string; url: string }[] {
  const text = cellText(cell);
  const link = httpUrl(cellHyperlink(cell));
  if (!text && !link) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) {
    const title = lines[0] ?? '';
    const inline = httpUrl(title);
    const url = link ?? (inline && inline !== title ? inline : null);
    if (!title || !url || url === title) return [];
    return [{ title, url }];
  }
  const found: { title: string; url: string }[] = [];
  lines.forEach((line, index) => {
    const inline = httpUrl(line);
    if (inline) return;
    const url = index === 0 ? link : null;
    if (url) found.push({ title: line, url });
  });
  return found;
}

export async function readGuideFromFile(filePath: string): Promise<InterpretedGuide> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return interpretWorkbook(workbook);
}

export async function readGuideFromBuffer(buffer: Buffer): Promise<InterpretedGuide> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings still expect the older Node Buffer brand.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return interpretWorkbook(workbook);
}

export function interpretWorkbook(workbook: ExcelJS.Workbook): InterpretedGuide {
  const warnings: string[] = [];
  const start = workbook.getWorksheet('Start Here');
  if (!start) throw new Error('Workbook is missing the "Start Here" sheet.');

  const tiles: { question: string; name: string; sheetName: string }[] = [];
  for (const row of TILE_ROWS) {
    for (const col of TILE_COLS) {
      const question = cellText(start.getCell(row, col));
      const nameCell = start.getCell(row + 1, col);
      const name = cellText(nameCell);
      const linked =
        sheetLinkName(cellHyperlink(nameCell)) ??
        sheetLinkName(cellHyperlink(start.getCell(row, col)));
      const sheetName = linked ?? name;
      if (!question && !name) continue;
      tiles.push({ question, name, sheetName });
    }
  }

  const contactNote = cellText(start.getCell('B35')) || null;
  const topics: GuideTopic[] = [];
  const orgs = new Map<string, GuideOrg>();
  const roles: GuideRole[] = [];
  const resources = new Map<string, GuideResource>();

  const orderedSheets = tiles
    .map((tile) => tile.sheetName)
    .filter((name, index, all) => all.indexOf(name) === index);

  const jurisdictionFirst = [
    ...orderedSheets.filter((name) => name === JURISDICTION_SHEET),
    ...orderedSheets.filter((name) => name !== JURISDICTION_SHEET),
  ];

  jurisdictionFirst.forEach((sheetName, index) => {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) {
      throw new Error(`Workbook is missing topic sheet "${sheetName}".`);
    }
    const tile = tiles.find((item) => item.sheetName === sheetName);
    const question = cellText(sheet.getCell('B2')) || tile?.question || '';
    const name = tile?.name || sheetName;
    const slug = slugify(sheetName);
    const learnings = readLearnings(sheet);
    const roleTypes = readRoleTypes(sheet);
    const topic: GuideTopic = {
      slug,
      name,
      question,
      sortOrder: index + 1,
      sheet: sheetName,
      learnings,
      roleTypes,
    };
    topics.push(topic);

    const headerRow = findPlayerHeader(sheet);
    if (headerRow == null) {
      warnings.push(`${sheetName}: no Player header row`);
      return;
    }
    const seenOnSheet = new Set<string>();
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const playerName = cellText(row.getCell(2));
      if (!playerName) break;
      if (/back to start/i.test(playerName)) break;
      const orgSlug = slugify(playerName);
      if (seenOnSheet.has(orgSlug)) {
        warnings.push(`${sheetName} row ${rowNumber}: duplicate player "${playerName}"`);
        continue;
      }
      seenOnSheet.add(orgSlug);
      const website = httpUrl(cellHyperlink(row.getCell(2)));
      const roleLabel = cellText(row.getCell(3));
      const resourcesText = cellText(row.getCell(4)) || null;
      const needsText = cellText(row.getCell(6)) || null;
      const parsed = parseRoleLabel(
        roleLabel,
        roleTypes.map((roleType) => roleType.name),
      );
      if (parsed.unmatched.length > 0) {
        warnings.push(
          `${sheetName} row ${rowNumber}: unmatched role type "${parsed.unmatched.join(', ')}" for ${playerName}`,
        );
      }
      const existing = orgs.get(orgSlug);
      if (!existing) {
        const kindResult =
          sheetName === JURISDICTION_SHEET
            ? inferOrgKind(parsed.roleQualifier)
            : { kind: 'OTHER' as const, warning: `no jurisdiction row for ${playerName}` };
        if (kindResult.warning) warnings.push(`${playerName}: ${kindResult.warning}`);
        orgs.set(orgSlug, {
          slug: orgSlug,
          name: playerName,
          websiteUrl: website,
          isGroup: isGroupName(playerName),
          kind: kindResult.kind,
        });
      } else if (website && !existing.websiteUrl) {
        existing.websiteUrl = website;
      }

      const resourceKeys: string[] = [];
      const parsedResources = resourcesFromCell(row.getCell(5));
      if (cellText(row.getCell(5)) && parsedResources.length === 0) {
        warnings.push(
          `${sheetName} row ${rowNumber}: resource cell has no usable link for ${playerName}`,
        );
      }
      for (const resource of parsedResources) {
        const key = `${resource.url}||${resource.title}`;
        resourceKeys.push(key);
        if (!resources.has(key)) {
          resources.set(key, {
            title: resource.title,
            url: resource.url,
            kind: inferResourceKind(resource.title),
            ownerSlug: orgSlug,
          });
        }
      }

      roles.push({
        orgSlug,
        topicSlug: slug,
        roleLabel,
        roleTypeNames: parsed.roleTypeNames,
        roleQualifier: parsed.roleQualifier,
        isDocumented: parsed.isDocumented,
        hasRole: parsed.hasRole,
        resourcesText,
        needsText,
        resourceKeys,
        sourceSheet: sheetName,
        sourceRow: rowNumber,
      });
    }
  });

  // Recompute sort order to follow the Start Here tile order, not jurisdiction-first processing.
  const tileOrder = new Map(orderedSheets.map((name, index) => [name, index + 1]));
  for (const topic of topics) {
    topic.sortOrder = tileOrder.get(topic.sheet) ?? topic.sortOrder;
  }
  topics.sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    topics,
    orgs: [...orgs.values()],
    roles,
    resources: [...resources.values()],
    warnings,
    contactNote,
  };
}

function readLearnings(sheet: ExcelJS.Worksheet): GuideTopic['learnings'] {
  const start = findLabelRow(sheet, 'What we learned');
  const end = findLabelRow(sheet, 'Player types used on this page');
  if (start == null || end == null) return [];
  const learnings: GuideTopic['learnings'] = [];
  for (let rowNumber = start + 1; rowNumber < end; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const heading = cellText(row.getCell(2));
    const body = cellText(row.getCell(3));
    if (!heading || !body) continue;
    learnings.push({ heading, body, sortOrder: learnings.length + 1 });
  }
  return learnings;
}

function readRoleTypes(sheet: ExcelJS.Worksheet): GuideTopic['roleTypes'] {
  const start = findLabelRow(sheet, 'Player types used on this page');
  const end = findLabelRow(sheet, 'What each player shared');
  if (start == null || end == null) return [];
  const roleTypes: GuideTopic['roleTypes'] = [];
  for (let rowNumber = start + 1; rowNumber < end; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const name = cellText(row.getCell(2));
    const definition = cellText(row.getCell(3));
    if (!name || !definition) continue;
    if (/what each player shared/i.test(name)) break;
    roleTypes.push({ name, definition, sortOrder: roleTypes.length + 1 });
  }
  return roleTypes;
}

function findPlayerHeader(sheet: ExcelJS.Worksheet): number | null {
  let found: number | null = null;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (found != null) return;
    if (cellText(row.getCell(2)).toLowerCase() === 'player') found = rowNumber;
  });
  return found;
}
