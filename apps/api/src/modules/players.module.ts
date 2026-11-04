import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { Prisma } from 'db';
import { MaintainerDto, RoleListDto, RoleWriteDto } from '../dto';
import { rethrowPrisma } from '../errors';
import { pageResult, reviewFields } from '../present';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

const include = {
  maintainer: true,
  organization: true,
  topic: true,
  resources: true,
} satisfies Prisma.PlayerRoleInclude;

type RoleRow = Prisma.PlayerRoleGetPayload<{ include: typeof include }>;

function present(role: RoleRow, detailed: boolean) {
  return {
    id: role.id,
    roleLabel: role.roleLabel,
    roleTypeNames: role.roleTypeNames,
    roleQualifier: role.roleQualifier,
    isDocumented: role.isDocumented,
    hasRole: role.hasRole,
    resourcesText: role.resourcesText,
    needsText: role.needsText,
    status: role.status,
    sourceSheet: role.sourceSheet,
    sourceRow: role.sourceRow,
    organizationId: role.organizationId,
    topicId: role.topicId,
    organization: {
      id: role.organization.id,
      slug: role.organization.slug,
      name: role.organization.name,
    },
    topic: { id: role.topic.id, slug: role.topic.slug, name: role.topic.name },
    resourceIds: role.resources.map((resource) => resource.id),
    ...reviewFields(role, role.maintainer, detailed),
  };
}

@Controller('player-roles')
@Roles('EDITOR')
export class PlayersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ReviewService,
  ) {}

  @Get()
  async list(@Query() query: RoleListDto) {
    const where: Prisma.PlayerRoleWhereInput = {};
    const and: Prisma.PlayerRoleWhereInput[] = [];
    if (query.topic) and.push({ topic: { slug: query.topic } });
    if (query.q) {
      and.push({
        OR: [
          { roleLabel: { contains: query.q, mode: 'insensitive' } },
          { resourcesText: { contains: query.q, mode: 'insensitive' } },
          { needsText: { contains: query.q, mode: 'insensitive' } },
          { organization: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }
    if (and.length > 0) where.AND = and;
    const [total, rows] = await Promise.all([
      this.prisma.playerRole.count({ where }),
      this.prisma.playerRole.findMany({
        where,
        include,
        orderBy: [{ topic: { sortOrder: 'asc' } }, { organization: { name: 'asc' } }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return pageResult(
      rows.map((role) => present(role, true)),
      total,
      query.page,
      query.pageSize,
    );
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const role = await this.prisma.playerRole.findUnique({ where: { id }, include });
    if (!role) throw new NotFoundException('Role not found.');
    return present(role, true);
  }

  @Post()
  async create(@Body() body: RoleWriteDto, @CurrentUser() user: SessionUser) {
    try {
      const created = await this.prisma.playerRole.create({
        data: {
          organizationId: body.organizationId,
          topicId: body.topicId,
          roleLabel: body.roleLabel,
          roleTypeNames: body.roleTypeNames,
          roleQualifier: body.roleQualifier ?? null,
          isDocumented: body.isDocumented ?? true,
          hasRole: body.hasRole ?? true,
          resourcesText: body.resourcesText ?? null,
          needsText: body.needsText ?? null,
          status: body.status ?? 'PUBLISHED',
          sourceSheet: body.sourceSheet ?? 'manual',
          sourceRow: body.sourceRow ?? 0,
          reviewIntervalDays: body.reviewIntervalDays ?? 365,
          resources: body.resourceIds
            ? { connect: body.resourceIds.map((id) => ({ id })) }
            : undefined,
        },
        include,
      });
      await this.audit.record({
        actorId: user.id,
        action: 'create',
        entityType: 'playerRole',
        entityId: created.id,
        before: null,
        after: present(created, true),
      });
      return present(created, true);
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: RoleWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.playerRole.findUnique({ where: { id }, include });
    if (!existing) throw new NotFoundException('Role not found.');
    const updated = await this.prisma.playerRole.update({
      where: { id },
      data: {
        organizationId: body.organizationId,
        topicId: body.topicId,
        roleLabel: body.roleLabel,
        roleTypeNames: body.roleTypeNames,
        roleQualifier: body.roleQualifier,
        isDocumented: body.isDocumented,
        hasRole: body.hasRole,
        resourcesText: body.resourcesText,
        needsText: body.needsText,
        status: body.status,
        sourceSheet: body.sourceSheet,
        sourceRow: body.sourceRow,
        reviewIntervalDays: body.reviewIntervalDays,
        resources: body.resourceIds
          ? { set: body.resourceIds.map((resourceId) => ({ id: resourceId })) }
          : undefined,
      },
      include,
    });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'playerRole',
      entityId: id,
      before: present(existing, true),
      after: present(updated, true),
    });
    return present(updated, true);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const existing = await this.prisma.playerRole.findUnique({ where: { id }, include });
    if (!existing) throw new NotFoundException('Role not found.');
    await this.prisma.playerRole.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'playerRole',
      entityId: id,
      before: present(existing, true),
      after: null,
    });
  }

  @Post(':id/review')
  reviewNow(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.review.markReviewed('playerRole', id, user);
  }

  @Patch(':id/maintainer')
  @Roles('COORDINATOR')
  assign(@Param('id') id: string, @Body() body: MaintainerDto, @CurrentUser() user: SessionUser) {
    return this.review.assignMaintainer('playerRole', id, body.maintainerId, user);
  }
}

@Module({ imports: [ReviewModule], controllers: [PlayersController] })
export class PlayersModule {}
