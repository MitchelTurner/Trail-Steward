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
import { MaintainerDto, ResourceListDto, ResourceWriteDto } from '../dto';
import { rethrowPrisma } from '../errors';
import { blankToNull, pageResult, publicContent, reviewFields } from '../present';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

const include = { maintainer: true, ownerOrg: true } satisfies Prisma.ResourceInclude;
type Row = Prisma.ResourceGetPayload<{ include: typeof include }>;

function present(resource: Row, detailed: boolean) {
  return {
    id: resource.id,
    title: resource.title,
    url: resource.url,
    kind: resource.kind,
    description: resource.description,
    ownerOrgId: resource.ownerOrgId,
    ownerOrg: resource.ownerOrg
      ? { id: resource.ownerOrg.id, slug: resource.ownerOrg.slug, name: resource.ownerOrg.name }
      : null,
    linkStatus: resource.linkStatus,
    linkCheckedAt: resource.linkCheckedAt?.toISOString() ?? null,
    linkFinalUrl: resource.linkFinalUrl,
    linkHttpStatus: resource.linkHttpStatus,
    ...reviewFields(resource, resource.maintainer, detailed),
  };
}

@Controller('resources')
export class ResourcesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ReviewService,
  ) {}

  @Get()
  async list(@Query() query: ResourceListDto, @CurrentUser() user?: SessionUser) {
    const manage = query.scope === 'manage' && Boolean(user);
    const and: Prisma.ResourceWhereInput[] = [];
    if (!manage) and.push({ OR: [{ ownerOrgId: null }, { ownerOrg: publicContent }] });
    if (query.kind) and.push({ kind: query.kind });
    if (query.linkStatus) and.push({ linkStatus: query.linkStatus });
    if (query.topic) and.push({ roles: { some: { topic: { slug: query.topic } } } });
    if (query.q) {
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    const where = and.length > 0 ? { AND: and } : {};
    const [total, rows] = await Promise.all([
      this.prisma.resource.count({ where }),
      this.prisma.resource.findMany({
        where,
        include,
        orderBy: { title: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return pageResult(
      rows.map((resource) => present(resource, manage)),
      total,
      query.page,
      query.pageSize,
    );
  }

  @Get(':id')
  @Roles('EDITOR')
  async get(@Param('id') id: string) {
    const resource = await this.prisma.resource.findUnique({ where: { id }, include });
    if (!resource) throw new NotFoundException('Resource not found.');
    return present(resource, true);
  }

  @Post()
  @Roles('EDITOR')
  async create(@Body() body: ResourceWriteDto, @CurrentUser() user: SessionUser) {
    try {
      const created = await this.prisma.resource.create({
        data: {
          title: body.title,
          url: body.url,
          kind: body.kind,
          description: blankToNull(body.description),
          ownerOrgId: body.ownerOrgId ?? null,
          reviewIntervalDays: body.reviewIntervalDays ?? 180,
          roles: body.roleIds ? { connect: body.roleIds.map((id) => ({ id })) } : undefined,
        },
        include,
      });
      await this.audit.record({
        actorId: user.id,
        action: 'create',
        entityType: 'resource',
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
  @Roles('EDITOR')
  async update(
    @Param('id') id: string,
    @Body() body: ResourceWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.resource.findUnique({ where: { id }, include });
    if (!existing) throw new NotFoundException('Resource not found.');
    try {
      const updated = await this.prisma.resource.update({
        where: { id },
        data: {
          title: body.title,
          url: body.url,
          kind: body.kind,
          description: blankToNull(body.description),
          ownerOrgId: body.ownerOrgId,
          reviewIntervalDays: body.reviewIntervalDays,
          roles: body.roleIds ? { set: body.roleIds.map((roleId) => ({ id: roleId })) } : undefined,
        },
        include,
      });
      await this.audit.record({
        actorId: user.id,
        action: 'update',
        entityType: 'resource',
        entityId: id,
        before: present(existing, true),
        after: present(updated, true),
      });
      return present(updated, true);
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const existing = await this.prisma.resource.findUnique({ where: { id }, include });
    if (!existing) throw new NotFoundException('Resource not found.');
    await this.prisma.resource.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'resource',
      entityId: id,
      before: present(existing, true),
      after: null,
    });
  }

  @Post(':id/review')
  @Roles('EDITOR')
  reviewNow(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.review.markReviewed('resource', id, user);
  }

  @Patch(':id/maintainer')
  @Roles('COORDINATOR')
  assign(@Param('id') id: string, @Body() body: MaintainerDto, @CurrentUser() user: SessionUser) {
    return this.review.assignMaintainer('resource', id, body.maintainerId, user);
  }
}

@Module({ imports: [ReviewModule], controllers: [ResourcesController] })
export class ResourcesModule {}
