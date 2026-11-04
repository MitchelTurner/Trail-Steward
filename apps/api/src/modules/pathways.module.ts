import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Prisma } from 'db';
import { condSchema, questionsSchema, roleAtLeast } from 'shared';
import { MaintainerDto, PathwayWriteDto, StepWriteDto } from '../dto';
import { rethrowPrisma } from '../errors';
import { reviewFields } from '../present';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

function jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value == null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

@Controller('pathways')
export class PathwaysController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ReviewService,
  ) {}

  @Get()
  async list() {
    const rows = await this.prisma.pathway.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { title: 'asc' },
      include: { maintainer: true },
    });
    return rows.map((pathway) => ({
      id: pathway.id,
      slug: pathway.slug,
      title: pathway.title,
      summary: pathway.summary,
      status: pathway.status,
      version: pathway.version,
      ...reviewFields(pathway, pathway.maintainer, false),
    }));
  }

  @Get(':slug')
  async get(@Param('slug') slug: string, @CurrentUser() user?: SessionUser) {
    const pathway = await this.prisma.pathway.findUnique({
      where: { slug },
      include: {
        maintainer: true,
        steps: {
          orderBy: { sortOrder: 'asc' },
          include: { resources: { include: { resource: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!pathway) throw new NotFoundException('Pathway not found.');
    if (pathway.status !== 'PUBLISHED' && !user) throw new NotFoundException('Pathway not found.');
    const questions = questionsSchema.parse(pathway.questions);
    return {
      id: pathway.id,
      slug: pathway.slug,
      title: pathway.title,
      summary: pathway.summary,
      status: pathway.status,
      version: pathway.version,
      questions,
      ...reviewFields(pathway, pathway.maintainer, Boolean(user)),
      // Public visitors see step titles only. The instructions stay on the saved checklist.
      steps: pathway.steps.map((step) => {
        const outline = {
          id: step.id,
          key: step.key,
          sortOrder: step.sortOrder,
          title: step.title,
          topicSlugs: step.topicSlugs,
          prerequisiteKeys: step.prerequisiteKeys,
        };
        if (!user) return outline;
        return {
          ...outline,
          why: step.why,
          howTo: step.howTo,
          examples: step.examples,
          showIf: step.showIf,
          contactQuery: step.contactQuery,
          resources: step.resources.map((link) => ({
            id: link.resource.id,
            title: link.resource.title,
            url: link.resource.url,
            kind: link.resource.kind,
            linkStatus: link.resource.linkStatus,
          })),
        };
      }),
    };
  }

  @Patch(':id')
  @Roles('EDITOR')
  async update(
    @Param('id') id: string,
    @Body() body: PathwayWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.pathway.findUnique({
      where: { id },
      include: { maintainer: true },
    });
    if (!existing) throw new NotFoundException('Pathway not found.');
    if (body.status && body.status !== existing.status && !roleAtLeast(user.role, 'COORDINATOR')) {
      throw new ForbiddenException('A coordinator publishes pathways.');
    }
    const updated = await this.prisma.pathway.update({
      where: { id },
      data: {
        title: body.title,
        summary: body.summary,
        status: body.status,
        questions: body.questions as Prisma.InputJsonValue | undefined,
        reviewIntervalDays: body.reviewIntervalDays,
      },
      include: { maintainer: true },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'pathway',
      entityId: id,
      before: { title: existing.title, summary: existing.summary, status: existing.status },
      after: { title: updated.title, summary: updated.summary, status: updated.status },
    });
    return {
      id: updated.id,
      slug: updated.slug,
      title: updated.title,
      summary: updated.summary,
      status: updated.status,
      version: updated.version,
      ...reviewFields(updated, updated.maintainer, true),
    };
  }

  @Post(':id/steps')
  @Roles('EDITOR')
  async addStep(
    @Param('id') id: string,
    @Body() body: StepWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    if (!body.key || !body.title || !body.why || !body.howTo) {
      throw new BadRequestException('A step needs a key, title, why, and how to.');
    }
    this.assertCond(body.showIf);
    const pathway = await this.prisma.pathway.findUnique({ where: { id } });
    if (!pathway) throw new NotFoundException('Pathway not found.');
    try {
      const step = await this.prisma.pathwayStep.create({
        data: {
          pathwayId: id,
          key: body.key,
          sortOrder: body.sortOrder ?? 0,
          title: body.title,
          why: body.why,
          howTo: body.howTo,
          examples: body.examples ?? null,
          topicSlugs: body.topicSlugs ?? [],
          prerequisiteKeys: body.prerequisiteKeys ?? [],
          showIf: jsonOrNull(body.showIf ?? null),
          contactQuery: jsonOrNull(body.contactQuery ?? null),
          resources: body.resourceIds
            ? {
                create: body.resourceIds.map((resourceId, index) => ({
                  resourceId,
                  sortOrder: index,
                })),
              }
            : undefined,
        },
      });
      await this.prisma.pathway.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.audit.record({
        actorId: user.id,
        action: 'create',
        entityType: 'pathwayStep',
        entityId: step.id,
        before: null,
        after: { key: step.key, title: step.title },
      });
      return step;
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  @Patch(':id/steps/:stepId')
  @Roles('EDITOR')
  async updateStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() body: StepWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    this.assertCond(body.showIf);
    const existing = await this.prisma.pathwayStep.findFirst({
      where: { id: stepId, pathwayId: id },
    });
    if (!existing) throw new NotFoundException('Step not found.');
    const updated = await this.prisma.pathwayStep.update({
      where: { id: stepId },
      data: {
        key: body.key,
        sortOrder: body.sortOrder,
        title: body.title,
        why: body.why,
        howTo: body.howTo,
        examples: body.examples,
        topicSlugs: body.topicSlugs,
        prerequisiteKeys: body.prerequisiteKeys,
        showIf: body.showIf === undefined ? undefined : jsonOrNull(body.showIf),
        contactQuery: body.contactQuery === undefined ? undefined : jsonOrNull(body.contactQuery),
      },
    });
    if (body.resourceIds) {
      await this.prisma.stepResource.deleteMany({ where: { stepId } });
      if (body.resourceIds.length > 0) {
        await this.prisma.stepResource.createMany({
          data: body.resourceIds.map((resourceId, index) => ({
            stepId,
            resourceId,
            sortOrder: index,
          })),
        });
      }
    }
    await this.prisma.pathway.update({ where: { id }, data: { version: { increment: 1 } } });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'pathwayStep',
      entityId: stepId,
      before: { title: existing.title, howTo: existing.howTo },
      after: { title: updated.title, howTo: updated.howTo },
    });
    return updated;
  }

  @Delete(':id/steps/:stepId')
  @Roles('EDITOR')
  @HttpCode(204)
  async removeStep(
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.pathwayStep.findFirst({
      where: { id: stepId, pathwayId: id },
    });
    if (!existing) throw new NotFoundException('Step not found.');
    await this.prisma.pathwayStep.delete({ where: { id: stepId } });
    await this.prisma.pathway.update({ where: { id }, data: { version: { increment: 1 } } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'pathwayStep',
      entityId: stepId,
      before: { key: existing.key, title: existing.title },
      after: null,
    });
  }

  @Post(':id/review')
  @Roles('EDITOR')
  reviewNow(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.review.markReviewed('pathway', id, user);
  }

  @Patch(':id/maintainer')
  @Roles('COORDINATOR')
  assign(@Param('id') id: string, @Body() body: MaintainerDto, @CurrentUser() user: SessionUser) {
    return this.review.assignMaintainer('pathway', id, body.maintainerId, user);
  }

  private assertCond(value: unknown): void {
    if (value == null) return;
    if (!condSchema.safeParse(value).success)
      throw new BadRequestException('That show-if rule is not valid.');
  }
}

@Module({ imports: [ReviewModule], controllers: [PathwaysController] })
export class PathwaysModule {}
