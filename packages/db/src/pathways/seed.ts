import fs from 'node:fs';
import path from 'node:path';
import { Prisma, type PrismaClient } from '@prisma/client';
import { contactQuerySchema, questionsSchema, type Question } from 'shared';

// TODO(spec): "Not sure" on federal funding shows the federal review step, so that step is not skipped
// when the funding source is still unknown. Forest Service and National Park Service land show it too.
// A prerequisite only holds a later step when that earlier step is on the checklist.
// Hidden steps, such as the plan check after a trail is already in a plan, do not hold it.

type StepFile = {
  key: string;
  sortOrder: number;
  title: string;
  why: string;
  howTo: string;
  examples?: string | null;
  topicSlugs: string[];
  prerequisiteKeys: string[];
  showIf?: unknown;
  contactQuery?: unknown;
  resourceTitles?: string[];
};

type PathwayFile = {
  slug: string;
  title: string;
  summary: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  questions: Question[];
  steps: StepFile[];
};

export function findRepoRoot(start: string): string {
  let dir = start;
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find the repository root.');
    dir = parent;
  }
}

function stable(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      const record = input as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = normalize(record[key]);
          return acc;
        }, {});
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function jsonField(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export async function seedPathways(prisma: PrismaClient, rootDir: string): Promise<void> {
  const dir = path.join(rootDir, 'content', 'pathways');
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  if (files.length === 0) throw new Error(`No pathway files in ${dir}`);

  for (const fileName of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8')) as PathwayFile;
    const questions = questionsSchema.parse(raw.questions);
    for (const step of raw.steps) {
      if (step.showIf != null && typeof step.showIf !== 'object') {
        throw new Error(`${raw.slug} step ${step.key} has an invalid showIf.`);
      }
      if (step.contactQuery != null) contactQuerySchema.parse(step.contactQuery);
    }

    const titles = [...new Set(raw.steps.flatMap((step) => step.resourceTitles ?? []))];
    const resources = titles.length
      ? await prisma.resource.findMany({ where: { title: { in: titles } } })
      : [];
    const byTitle = new Map(resources.map((resource) => [resource.title, resource]));
    for (const title of titles) {
      if (!byTitle.has(title)) {
        throw new Error(
          `Pathway seed: resource titled "${title}" was not found. Import the guide before seeding pathways.`,
        );
      }
    }

    const existing = await prisma.pathway.findUnique({
      where: { slug: raw.slug },
      include: {
        steps: {
          include: { resources: { include: { resource: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    const desiredSteps = [...raw.steps].sort((a, b) => a.sortOrder - b.sortOrder);
    const desiredSignature = stable(
      desiredSteps.map((step) => ({
        key: step.key,
        sortOrder: step.sortOrder,
        title: step.title,
        why: step.why,
        howTo: step.howTo,
        examples: step.examples ?? null,
        topicSlugs: step.topicSlugs,
        prerequisiteKeys: step.prerequisiteKeys,
        showIf: step.showIf ?? null,
        contactQuery: step.contactQuery ?? null,
        resourceTitles: step.resourceTitles ?? [],
      })),
    );
    const currentSignature = existing
      ? stable(
          [...existing.steps]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((step) => ({
              key: step.key,
              sortOrder: step.sortOrder,
              title: step.title,
              why: step.why,
              howTo: step.howTo,
              examples: step.examples,
              topicSlugs: step.topicSlugs,
              prerequisiteKeys: step.prerequisiteKeys,
              showIf: step.showIf ?? null,
              contactQuery: step.contactQuery ?? null,
              resourceTitles: step.resources.map((link) => link.resource.title),
            })),
        )
      : null;

    const stepsChanged = desiredSignature !== currentSignature;
    const questionsChanged = stable(existing?.questions ?? null) !== stable(questions);
    const textChanged =
      existing != null && (existing.title !== raw.title || existing.summary !== raw.summary);

    if (existing && !stepsChanged && !questionsChanged && !textChanged) {
      console.log(`Pathway ${raw.slug} unchanged (version ${existing.version}).`);
      continue;
    }

    const pathway = existing
      ? await prisma.pathway.update({
          where: { id: existing.id },
          data: {
            title: raw.title,
            summary: raw.summary,
            questions: questions as Prisma.InputJsonValue,
            version: existing.version + (stepsChanged ? 1 : 0),
          },
        })
      : await prisma.pathway.create({
          data: {
            slug: raw.slug,
            title: raw.title,
            summary: raw.summary,
            status: raw.status,
            questions: questions as Prisma.InputJsonValue,
            version: 1,
            reviewedAt: null,
            maintainerId: null,
          },
        });

    if (!stepsChanged) {
      console.log(
        `Pathway ${raw.slug} updated without a step change (version ${pathway.version}).`,
      );
      continue;
    }

    const keepKeys = new Set(raw.steps.map((step) => step.key));
    if (existing) {
      const stale = existing.steps.filter((step) => !keepKeys.has(step.key));
      if (stale.length > 0) {
        await prisma.pathwayStep.deleteMany({
          where: { id: { in: stale.map((step) => step.id) } },
        });
      }
    }

    for (const step of raw.steps) {
      const resourceIds = (step.resourceTitles ?? []).map((title) => {
        const resource = byTitle.get(title);
        if (!resource) throw new Error(`Missing resource ${title}`);
        return resource.id;
      });
      const saved = await prisma.pathwayStep.upsert({
        where: { pathwayId_key: { pathwayId: pathway.id, key: step.key } },
        create: {
          pathwayId: pathway.id,
          key: step.key,
          sortOrder: step.sortOrder,
          title: step.title,
          why: step.why,
          howTo: step.howTo,
          examples: step.examples ?? null,
          topicSlugs: step.topicSlugs,
          prerequisiteKeys: step.prerequisiteKeys,
          showIf: jsonField(step.showIf ?? null),
          contactQuery: jsonField(step.contactQuery ?? null),
        },
        update: {
          sortOrder: step.sortOrder,
          title: step.title,
          why: step.why,
          howTo: step.howTo,
          examples: step.examples ?? null,
          topicSlugs: step.topicSlugs,
          prerequisiteKeys: step.prerequisiteKeys,
          showIf: jsonField(step.showIf ?? null),
          contactQuery: jsonField(step.contactQuery ?? null),
        },
      });
      await prisma.stepResource.deleteMany({ where: { stepId: saved.id } });
      if (resourceIds.length > 0) {
        await prisma.stepResource.createMany({
          data: resourceIds.map((resourceId, index) => ({
            stepId: saved.id,
            resourceId,
            sortOrder: index,
          })),
        });
      }
    }
    console.log(`Pathway ${raw.slug} seeded at version ${pathway.version}.`);
  }
}
