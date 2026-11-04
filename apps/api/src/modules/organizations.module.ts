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
import { slugify } from 'shared';
import { MaintainerDto, OrgListDto, OrgPatchDto, OrgWriteDto } from '../dto';
import { rethrowPrisma } from '../errors';
import { blankToNull, pageResult, publicContent, reviewFields } from '../present';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit.service';
import { Roles, type SessionUser, CurrentUser } from '../session';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

const orgInclude = { maintainer: true } satisfies Prisma.OrganizationInclude;

function presentOrg(
  org: Prisma.OrganizationGetPayload<{ include: typeof orgInclude }>,
  detailed: boolean,
) {
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    shortName: org.shortName,
    kind: org.kind,
    websiteUrl: org.websiteUrl,
    linkStatus: org.linkStatus,
    ...(detailed
      ? {
          linkCheckedAt: org.linkCheckedAt?.toISOString() ?? null,
          linkFinalUrl: org.linkFinalUrl,
          linkHttpStatus: org.linkHttpStatus,
        }
      : {}),
    description: org.description,
    communities: org.communities,
    isGroup: org.isGroup,
    visibility: org.visibility,
    contactName: org.contactName,
    contactEmail: org.contactEmail,
    contactPhone: org.contactPhone,
    status: org.status,
    ...reviewFields(org, org.maintainer, detailed),
  };
}

@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ReviewService,
  ) {}

  @Get()
  async list(@Query() query: OrgListDto, @CurrentUser() user?: SessionUser) {
    const manage = query.scope === 'manage' && Boolean(user);
    const filters: Prisma.OrganizationWhereInput[] = [];
    if (!manage) filters.push(publicContent);
    if (query.kind) filters.push({ kind: query.kind });
    if (query.q) {
      filters.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { shortName: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.topic) filters.push({ roles: { some: { topic: { slug: query.topic } } } });
    if (query.community) {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Organization"
        WHERE EXISTS (
          SELECT 1 FROM unnest(communities) AS c
          WHERE c ILIKE ${query.community}
        )`;
      filters.push({ id: { in: rows.length > 0 ? rows.map((row) => row.id) : ['__none__'] } });
    }
    const where = filters.length > 0 ? { AND: filters } : {};
    const [total, rows] = await Promise.all([
      this.prisma.organization.count({ where }),
      this.prisma.organization.findMany({
        where,
        include: orgInclude,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return pageResult(
      rows.map((org) => presentOrg(org, manage)),
      total,
      query.page,
      query.pageSize,
    );
  }

  @Get('manage/:id')
  @Roles('EDITOR')
  async manageGet(@Param('id') id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id }, include: orgInclude });
    if (!org) throw new NotFoundException('Organization not found.');
    return presentOrg(org, true);
  }

  @Get(':slug')
  async get(@Param('slug') slug: string, @CurrentUser() user?: SessionUser) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      include: {
        ...orgInclude,
        roles: {
          include: { topic: true, maintainer: true },
          orderBy: { topic: { sortOrder: 'asc' } },
        },
        resources: { orderBy: { title: 'asc' } },
      },
    });
    if (!org) throw new NotFoundException('Organization not found.');
    const staff = Boolean(user);
    if (!staff && (org.visibility !== 'PUBLIC' || org.status !== 'PUBLISHED')) {
      throw new NotFoundException('Organization not found.');
    }
    const topics = await this.prisma.topic.findMany({ orderBy: { sortOrder: 'asc' } });
    const byTopic = new Map(org.roles.map((role) => [role.topicId, role]));
    return {
      ...presentOrg(org, staff),
      rolesByTopic: topics.map((topic) => {
        const role = byTopic.get(topic.id);
        return {
          topicSlug: topic.slug,
          topicName: topic.name,
          roleLabel: role?.roleLabel ?? null,
          hasRole: role?.hasRole ?? null,
          isDocumented: role?.isDocumented ?? null,
          resourcesText: role?.resourcesText ?? null,
          needsText: role?.needsText ?? null,
          freshness: role ? reviewFields(role, role.maintainer, staff).freshness : null,
        };
      }),
      resources: org.resources.map((resource) => ({
        id: resource.id,
        title: resource.title,
        url: resource.url,
        kind: resource.kind,
        description: resource.description,
        linkStatus: resource.linkStatus,
        linkFinalUrl: resource.linkFinalUrl,
      })),
    };
  }

  @Post()
  @Roles('EDITOR')
  async create(@Body() body: OrgWriteDto, @CurrentUser() user: SessionUser) {
    try {
      const created = await this.prisma.organization.create({
        data: {
          name: body.name,
          slug: body.slug ? slugify(body.slug) : slugify(body.name),
          shortName: blankToNull(body.shortName),
          kind: body.kind,
          websiteUrl: blankToNull(body.websiteUrl),
          description: blankToNull(body.description),
          communities: body.communities ?? [],
          isGroup: body.isGroup ?? false,
          visibility: body.visibility ?? 'PUBLIC',
          contactName: blankToNull(body.contactName),
          contactEmail: blankToNull(body.contactEmail),
          contactPhone: blankToNull(body.contactPhone),
          status: body.status ?? 'PUBLISHED',
          reviewIntervalDays: body.reviewIntervalDays ?? 365,
        },
        include: orgInclude,
      });
      await this.audit.record({
        actorId: user.id,
        action: 'create',
        entityType: 'organization',
        entityId: created.id,
        before: null,
        after: presentOrg(created, true),
      });
      return presentOrg(created, true);
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  @Patch(':id')
  @Roles('EDITOR')
  async update(
    @Param('id') id: string,
    @Body() body: OrgPatchDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
      include: orgInclude,
    });
    if (!existing) throw new NotFoundException('Organization not found.');
    const nextWebsite = body.websiteUrl === undefined ? undefined : blankToNull(body.websiteUrl);
    const websiteChanged = nextWebsite !== undefined && nextWebsite !== existing.websiteUrl;
    try {
      const updated = await this.prisma.organization.update({
        where: { id },
        data: {
          name: body.name,
          slug: body.slug ? slugify(body.slug) : undefined,
          shortName: blankToNull(body.shortName),
          kind: body.kind,
          websiteUrl: nextWebsite,
          ...(websiteChanged
            ? {
                linkStatus: 'UNCHECKED',
                linkCheckedAt: null,
                linkFinalUrl: null,
                linkHttpStatus: null,
              }
            : {}),
          description: blankToNull(body.description),
          communities: body.communities,
          isGroup: body.isGroup,
          visibility: body.visibility,
          contactName: blankToNull(body.contactName),
          contactEmail: blankToNull(body.contactEmail),
          contactPhone: blankToNull(body.contactPhone),
          status: body.status,
          reviewIntervalDays: body.reviewIntervalDays,
        },
        include: orgInclude,
      });
      await this.audit.record({
        actorId: user.id,
        action: 'update',
        entityType: 'organization',
        entityId: id,
        before: presentOrg(existing, true),
        after: presentOrg(updated, true),
      });
      return presentOrg(updated, true);
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const existing = await this.prisma.organization.findUnique({
      where: { id },
      include: orgInclude,
    });
    if (!existing) throw new NotFoundException('Organization not found.');
    await this.prisma.user.updateMany({
      where: { organizationId: id },
      data: { organizationId: null },
    });
    await this.prisma.resource.updateMany({
      where: { ownerOrgId: id },
      data: { ownerOrgId: null },
    });
    await this.prisma.organization.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'organization',
      entityId: id,
      before: presentOrg(existing, true),
      after: null,
    });
  }

  @Post(':id/review')
  @Roles('EDITOR')
  @HttpCode(200)
  reviewNow(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.review.markReviewed('organization', id, user);
  }

  @Patch(':id/maintainer')
  @Roles('COORDINATOR')
  assignMaintainer(
    @Param('id') id: string,
    @Body() body: MaintainerDto,
    @CurrentUser() user: SessionUser,
  ) {
    return this.review.assignMaintainer('organization', id, body.maintainerId, user);
  }
}

@Module({ imports: [ReviewModule], controllers: [OrganizationsController] })
export class OrganizationsModule {}
