import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Prisma } from 'db';
import type { Response } from 'express';
import {
  FALLBACK_ORG_MATCHES,
  buildAnswerSchema,
  condSchema,
  contactQuerySchema,
  landTypeNeedles,
  markdownToPlain,
  orgMatchesNeedles,
  questionsSchema,
  selectSteps,
  stepStateSchema,
  visiblePrerequisites,
  type Answers,
  type Cond,
  type ContactQuery,
  type Question,
} from 'shared';
import { ChecklistCreateDto, ChecklistPatchDto } from '../dto';
import { AuditService } from '../audit.service';
import { PrismaService } from '../prisma.service';
import { publicContent } from '../present';
import { LIMITS } from '../tokens';
import { renderChecklistPdf } from './checklist-pdf';

type StoredStep = {
  key: string;
  sortOrder: number;
  title: string;
  why: string;
  howTo: string;
  examples: string | null;
  topicSlugs: string[];
  prerequisiteKeys: string[];
  showIf: unknown;
  contactQuery: unknown;
  resources: {
    sortOrder: number;
    resource: {
      id: string;
      title: string;
      url: string;
      kind: string;
      linkStatus: string;
      linkFinalUrl: string | null;
      reviewedAt: Date | null;
    };
  }[];
};

type Contact = {
  name: string;
  shortName: string | null;
  websiteUrl: string | null;
  roleLabel: string;
  reviewedAt: Date | null;
};

function asCond(value: unknown): Cond | null {
  if (value == null) return null;
  const parsed = condSchema.safeParse(value);
  if (!parsed.success) return { q: '__invalid__', in: [] };
  return parsed.data;
}

function asAnswers(value: unknown): Answers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Answers;
}

function labelFor(question: Question, answers: Answers): string {
  const raw = answers[question.id];
  if (question.type === 'multi' && Array.isArray(raw)) {
    return raw
      .map(
        (value) =>
          question.options.find((option) => option.value === value)?.label ?? String(value),
      )
      .join(', ');
  }
  if (question.type === 'single' && typeof raw === 'string') {
    return question.options.find((option) => option.value === raw)?.label ?? raw;
  }
  return typeof raw === 'string' ? raw : '';
}

function reviewedRange(dates: Date[]): string {
  if (dates.length === 0) return 'not yet reviewed';
  const format = (date: Date) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Anchorage',
      month: 'short',
      year: 'numeric',
    }).format(date);
  const min = dates.reduce((a, b) => (a < b ? a : b));
  const max = dates.reduce((a, b) => (a > b ? a : b));
  const start = format(min);
  const end = format(max);
  return start === end ? start : `${start}–${end}`;
}

@Controller('checklists')
export class ChecklistsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Throttle({ default: { limit: LIMITS.checklistCreate, ttl: 60 * 60 * 1000 } })
  async create(@Body() body: ChecklistCreateDto) {
    const pathway = await this.prisma.pathway.findUnique({ where: { slug: body.pathwaySlug } });
    if (!pathway || pathway.status !== 'PUBLISHED')
      throw new NotFoundException('Pathway not found.');
    const questions = questionsSchema.parse(pathway.questions);
    const answers = buildAnswerSchema(questions).parse(body.answers);
    const community = typeof answers.community === 'string' ? answers.community : null;
    const token = randomBytes(24).toString('base64url');
    await this.prisma.checklist.create({
      data: {
        token,
        pathwayId: pathway.id,
        pathwayVersion: pathway.version,
        title: 'My trail project',
        answers: answers as Prisma.InputJsonValue,
        stepState: {},
        community,
      },
    });
    return { token, url: `/c/${token}` };
  }

  @Get(':token')
  async get(@Param('token') token: string) {
    return this.resolve(token, true);
  }

  @Patch(':token')
  @Throttle({ default: { limit: LIMITS.checklistPatch, ttl: 60 * 60 * 1000 } })
  async update(@Param('token') token: string, @Body() body: ChecklistPatchDto) {
    const checklist = await this.prisma.checklist.findUnique({
      where: { token },
      include: { pathway: { include: { steps: true } } },
    });
    if (!checklist) throw new NotFoundException('Checklist not found.');
    const current = stepStateSchema.safeParse(checklist.stepState).success
      ? stepStateSchema.parse(checklist.stepState)
      : {};
    const next = { ...current };
    if (body.stepState) {
      for (const [key, value] of Object.entries(body.stepState)) {
        const doneAt = value.done ? value.doneAt || new Date().toISOString() : undefined;
        next[key] = {
          done: value.done,
          ...(value.note ? { note: value.note } : {}),
          ...(doneAt ? { doneAt } : {}),
        };
      }
      const visible = selectSteps(
        checklist.pathway.steps.map((step) => ({ ...step, showIf: asCond(step.showIf) })),
        asAnswers(checklist.answers),
      );
      const byKey = new Map(visible.map((step) => [step.key, step]));
      for (const [key, value] of Object.entries(body.stepState)) {
        if (!value.done || current[key]?.done) continue;
        const step = byKey.get(key);
        if (!step) continue;
        const earlier = visiblePrerequisites(step, visible).find((item) => !next[item.key]?.done);
        if (earlier) throw new BadRequestException(`Finish "${earlier.title}" first.`);
      }
    }
    await this.prisma.checklist.update({
      where: { id: checklist.id },
      data: {
        title: body.title,
        stepState: next as Prisma.InputJsonValue,
      },
    });
    return this.resolve(token, false);
  }

  @Get(':token/pdf')
  @Throttle({ default: { limit: LIMITS.pdf, ttl: 60 * 60 * 1000 } })
  @Header('Content-Type', 'application/pdf')
  async pdf(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const resolved = await this.resolve(token, true);
    const generatedAt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Anchorage',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    const buffer = await renderChecklistPdf({
      title: resolved.title,
      community: resolved.community,
      generatedAt,
      answers: resolved.answerLabels,
      steps: resolved.steps.map((step) => ({
        done: step.done,
        title: step.title,
        howTo: markdownToPlain(step.howTo),
        resources: step.resources.map((resource) => ({ title: resource.title, url: resource.url })),
        contacts: step.contacts.map((contact) => ({
          name: contact.name,
          websiteUrl: contact.websiteUrl,
        })),
      })),
      reviewedRange: resolved.reviewedRange,
    });
    await this.audit.record({
      action: 'pdf.download',
      entityType: 'checklist',
      entityId: resolved.id,
      after: { community: resolved.community },
    });
    res.setHeader('Content-Disposition', 'attachment; filename="trail-checklist.pdf"');
    return new StreamableFile(buffer);
  }

  private async resolve(token: string, touch: boolean) {
    const checklist = await this.prisma.checklist.findUnique({
      where: { token },
      include: {
        pathway: {
          include: {
            steps: {
              orderBy: { sortOrder: 'asc' },
              include: {
                resources: { include: { resource: true }, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!checklist) throw new NotFoundException('Checklist not found.');
    if (touch) {
      await this.prisma.checklist.update({
        where: { id: checklist.id },
        data: { lastOpenedAt: new Date() },
      });
    }
    const questions = questionsSchema.parse(checklist.pathway.questions);
    const answers = asAnswers(checklist.answers);
    const stateParsed = stepStateSchema.safeParse(checklist.stepState);
    const state = stateParsed.success ? stateParsed.data : {};
    const selected = selectSteps(
      checklist.pathway.steps.map((step) => ({
        ...step,
        showIf: asCond(step.showIf),
      })),
      answers,
    );
    const contacts = await this.contactsFor(selected, answers);
    const dates: Date[] = [];
    const steps = selected.map((step) => {
      const saved = state[step.key];
      const stepContacts = contacts.get(step.key) ?? [];
      for (const link of step.resources)
        if (link.resource.reviewedAt) dates.push(link.resource.reviewedAt);
      for (const contact of stepContacts) if (contact.reviewedAt) dates.push(contact.reviewedAt);
      return {
        key: step.key,
        title: step.title,
        why: step.why,
        howTo: step.howTo,
        examples: step.examples,
        topicSlugs: step.topicSlugs,
        waitFor: visiblePrerequisites(step, selected).map((item) => ({
          key: item.key,
          title: item.title,
        })),
        done: Boolean(saved?.done),
        note: saved?.note ?? '',
        doneAt: saved?.doneAt ?? null,
        resources: step.resources.map((link) => ({
          id: link.resource.id,
          title: link.resource.title,
          url: link.resource.url,
          kind: link.resource.kind,
          linkStatus: link.resource.linkStatus,
          linkFinalUrl: link.resource.linkFinalUrl,
        })),
        contacts: stepContacts.map(({ reviewedAt: _reviewedAt, ...contact }) => contact),
      };
    });
    const done = steps.filter((step) => step.done).length;
    return {
      id: checklist.id,
      title: checklist.title,
      community: checklist.community,
      pathway: {
        slug: checklist.pathway.slug,
        title: checklist.pathway.title,
        summary: checklist.pathway.summary,
        version: checklist.pathway.version,
      },
      pathwayVersion: checklist.pathwayVersion,
      answers,
      answerLabels: questions.map((question) => ({
        label: question.label,
        value: labelFor(question, answers),
      })),
      progress: { done, total: steps.length },
      steps,
      reviewedRange: reviewedRange(dates),
      updatedAt: checklist.updatedAt.toISOString(),
    };
  }

  private async contactsFor(steps: StoredStep[], answers: Answers) {
    const queries = new Map<string, ContactQuery>();
    const topicSlugs = new Set<string>();
    for (const step of steps) {
      if (step.contactQuery == null) continue;
      const parsed = contactQuerySchema.safeParse(step.contactQuery);
      if (!parsed.success) continue;
      queries.set(step.key, parsed.data);
      for (const slug of parsed.data.topics) topicSlugs.add(slug);
    }
    const [roles, orgs] = await Promise.all([
      topicSlugs.size === 0
        ? Promise.resolve([])
        : this.prisma.playerRole.findMany({
            where: {
              hasRole: true,
              isDocumented: true,
              status: 'PUBLISHED',
              organization: publicContent,
              topic: { slug: { in: [...topicSlugs] } },
            },
            include: { organization: true, topic: true },
          }),
      this.prisma.organization.findMany({ where: publicContent }),
    ]);
    const land = Array.isArray(answers.landTypes)
      ? answers.landTypes.filter((value): value is string => typeof value === 'string')
      : [];
    const result = new Map<string, Contact[]>();
    for (const [key, query] of queries) {
      const needles = query.landTypes
        ? landTypeNeedles(land)
        : { filter: false, needles: [] as string[] };
      const wanted = new Set((query.roleTypes ?? []).map((name) => name.toLowerCase()));
      const matched = roles
        .filter((role) => {
          if (!query.topics.includes(role.topic.slug)) return false;
          if (wanted.size > 0 && !role.roleTypeNames.some((name) => wanted.has(name.toLowerCase())))
            return false;
          if (needles.filter && !orgMatchesNeedles(role.organization, needles.needles))
            return false;
          return true;
        })
        .sort((a, b) => a.organization.name.localeCompare(b.organization.name));
      const seen = new Set<string>();
      const list: Contact[] = [];
      for (const role of matched) {
        if (seen.has(role.organizationId)) continue;
        seen.add(role.organizationId);
        list.push({
          name: role.organization.name,
          shortName: role.organization.shortName,
          websiteUrl: role.organization.websiteUrl,
          roleLabel: role.roleLabel,
          reviewedAt: role.organization.reviewedAt,
        });
      }
      for (const needle of FALLBACK_ORG_MATCHES) {
        const org = orgs.find((item) => orgMatchesNeedles(item, [needle]) && !seen.has(item.id));
        if (!org) continue;
        seen.add(org.id);
        list.push({
          name: org.name,
          shortName: org.shortName,
          websiteUrl: org.websiteUrl,
          roleLabel: 'General contact',
          reviewedAt: org.reviewedAt,
        });
      }
      result.set(key, list);
    }
    return result;
  }
}

@Module({ controllers: [ChecklistsController] })
export class ChecklistsModule {}
