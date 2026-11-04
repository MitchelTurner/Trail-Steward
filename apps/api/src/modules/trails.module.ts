import {
  BadRequestException,
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
import { lineStringSchema, pointSchema, slugify, type GeoPoint, type LineString } from 'shared';
import { AuditService } from '../audit.service';
import { AssetWriteDto, MaintainerDto, TrailListDto, TrailPatchDto, TrailWriteDto } from '../dto';
import { blankToNull, pageResult, publicContent, reviewFields } from '../present';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

const trailInclude = {
  maintainer: true,
  dataSteward: { select: { slug: true, name: true } },
  maintenanceOwner: { select: { slug: true, name: true } },
  assets: { include: { maintainer: true }, orderBy: { name: 'asc' } },
  workdays: {
    include: { hostOrg: { select: { slug: true, name: true } } },
    orderBy: { workDate: 'asc' as const },
  },
} satisfies Prisma.TrailInclude;

type TrailRow = Prisma.TrailGetPayload<{ include: typeof trailInclude }>;

function asLine(value: Prisma.JsonValue): LineString | null {
  const parsed = lineStringSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asPoint(value: Prisma.JsonValue): GeoPoint | null {
  const parsed = pointSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function presentTrail(trail: TrailRow, detailed: boolean) {
  return {
    id: trail.id,
    slug: trail.slug,
    name: trail.name,
    summary: trail.summary,
    ...(detailed ? { status: trail.status, visibility: trail.visibility } : {}),
    line: asLine(trail.line),
    dataSteward: trail.dataSteward,
    maintenanceOwner: trail.maintenanceOwner,
    ...(detailed
      ? {
          dataStewardOrgId: trail.dataStewardOrgId,
          maintenanceOwnerOrgId: trail.maintenanceOwnerOrgId,
        }
      : {}),
    workdays: trail.workdays
      .filter((day) => detailed || day.status === 'PLANNED')
      .map((day) => ({
        id: day.id,
        title: day.title,
        notes: day.notes,
        workDate: day.workDate.toISOString().slice(0, 10),
        status: day.status,
        hostOrg: day.hostOrg,
      })),
    assets: trail.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      kind: asset.kind,
      notes: asset.notes,
      point: asPoint(asset.point),
      ...reviewFields(asset, asset.maintainer, detailed),
    })),
    ...reviewFields(trail, trail.maintainer, detailed),
  };
}

@Controller('trails')
export class TrailsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ReviewService,
  ) {}

  @Get()
  async list(@Query() query: TrailListDto, @CurrentUser() user?: SessionUser) {
    const manage = query.scope === 'manage' && Boolean(user);
    const filters: Prisma.TrailWhereInput[] = [];
    if (!manage) filters.push(publicContent);
    if (
      query.west !== undefined ||
      query.south !== undefined ||
      query.east !== undefined ||
      query.north !== undefined
    ) {
      if (
        query.west === undefined ||
        query.south === undefined ||
        query.east === undefined ||
        query.north === undefined
      ) {
        throw new BadRequestException('A map box needs west, south, east, and north.');
      }
      if (query.west >= query.east || query.south >= query.north) {
        throw new BadRequestException('That map box is empty.');
      }
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Trail"
        WHERE geom && ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326)`;
      filters.push({ id: { in: rows.length > 0 ? rows.map((row) => row.id) : ['__none__'] } });
    }
    const where = filters.length > 0 ? { AND: filters } : {};
    const [total, rows] = await Promise.all([
      this.prisma.trail.count({ where }),
      this.prisma.trail.findMany({
        where,
        include: trailInclude,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return pageResult(
      rows.map((trail) => presentTrail(trail, manage)),
      total,
      query.page,
      query.pageSize,
    );
  }

  @Post()
  @Roles('EDITOR')
  @HttpCode(201)
  async create(@Body() body: TrailWriteDto, @CurrentUser() user: SessionUser) {
    await this.requireOrgs(body.dataStewardOrgId, body.maintenanceOwnerOrgId);
    const slug = await this.uniqueSlug(body.name);
    const trail = await this.prisma.trail.create({
      data: {
        slug,
        name: body.name,
        summary: body.summary ?? '',
        status: body.status ?? 'DRAFT',
        visibility: body.visibility ?? 'PUBLIC',
        line: body.line,
        dataStewardOrgId: body.dataStewardOrgId ?? null,
        maintenanceOwnerOrgId: body.maintenanceOwnerOrgId ?? null,
        reviewIntervalDays: body.reviewIntervalDays ?? 365,
      },
      include: trailInclude,
    });
    await this.writeLine(trail.id, body.line, true);
    await this.audit.record({
      actorId: user.id,
      action: 'create',
      entityType: 'trail',
      entityId: trail.id,
      after: { slug, name: body.name },
    });
    return presentTrail(await this.load(slug, true), true);
  }

  @Get(':slug')
  async getOne(@Param('slug') slug: string, @CurrentUser() user?: SessionUser) {
    return presentTrail(await this.load(slug, Boolean(user)), Boolean(user));
  }

  @Patch(':slug')
  @Roles('EDITOR')
  async update(
    @Param('slug') slug: string,
    @Body() body: TrailPatchDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.load(slug, true);
    await this.requireOrgs(body.dataStewardOrgId, body.maintenanceOwnerOrgId);
    const line = body.line ?? asLine(existing.line);
    if (!line) throw new BadRequestException('A trail needs a line on the map.');
    await this.prisma.trail.update({
      where: { id: existing.id },
      data: {
        name: body.name,
        summary: body.summary,
        status: body.status,
        visibility: body.visibility,
        line: body.line,
        dataStewardOrgId: body.dataStewardOrgId,
        maintenanceOwnerOrgId: body.maintenanceOwnerOrgId,
        reviewIntervalDays: body.reviewIntervalDays,
      },
    });
    if (body.line) await this.writeLine(existing.id, body.line, false);
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'trail',
      entityId: existing.id,
      before: { name: existing.name },
      after: { name: body.name ?? existing.name },
    });
    return presentTrail(await this.load(slug, true), true);
  }

  @Delete(':slug')
  @Roles('EDITOR')
  @HttpCode(204)
  async remove(@Param('slug') slug: string, @CurrentUser() user: SessionUser) {
    const existing = await this.load(slug, true);
    await this.prisma.trail.delete({ where: { id: existing.id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'trail',
      entityId: existing.id,
      before: { slug: existing.slug, name: existing.name },
      after: null,
    });
  }

  @Post(':slug/assets')
  @Roles('EDITOR')
  @HttpCode(201)
  async addAsset(
    @Param('slug') slug: string,
    @Body() body: AssetWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.load(slug, true);
    const asset = await this.prisma.asset.create({
      data: {
        trailId: trail.id,
        name: body.name,
        kind: body.kind,
        notes: blankToNull(body.notes) ?? null,
        point: body.point,
        reviewIntervalDays: body.reviewIntervalDays ?? 365,
      },
    });
    await this.writePoint(asset.id, body.point, true);
    await this.audit.record({
      actorId: user.id,
      action: 'create',
      entityType: 'asset',
      entityId: asset.id,
      after: { name: body.name, trailId: trail.id },
    });
    return presentTrail(await this.load(slug, true), true);
  }

  @Patch(':slug/assets/:assetId')
  @Roles('EDITOR')
  async updateAsset(
    @Param('slug') slug: string,
    @Param('assetId') assetId: string,
    @Body() body: AssetWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.load(slug, true);
    const asset = trail.assets.find((item) => item.id === assetId);
    if (!asset) throw new NotFoundException('That map point is not on this trail.');
    await this.prisma.asset.update({
      where: { id: assetId },
      data: {
        name: body.name,
        kind: body.kind,
        notes: blankToNull(body.notes) ?? null,
        point: body.point,
        reviewIntervalDays: body.reviewIntervalDays,
      },
    });
    await this.writePoint(assetId, body.point, false);
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'asset',
      entityId: assetId,
      before: { name: asset.name },
      after: { name: body.name },
    });
    return presentTrail(await this.load(slug, true), true);
  }

  @Delete(':slug/assets/:assetId')
  @Roles('EDITOR')
  @HttpCode(204)
  async removeAsset(
    @Param('slug') slug: string,
    @Param('assetId') assetId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.load(slug, true);
    const asset = trail.assets.find((item) => item.id === assetId);
    if (!asset) throw new NotFoundException('That map point is not on this trail.');
    await this.prisma.asset.delete({ where: { id: assetId } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'asset',
      entityId: assetId,
      before: { name: asset.name },
      after: null,
    });
  }

  @Post(':slug/review')
  @Roles('EDITOR')
  @HttpCode(200)
  reviewNow(@Param('slug') slug: string, @CurrentUser() user: SessionUser) {
    return this.reviewBySlug(slug, user);
  }

  @Patch(':slug/maintainer')
  @Roles('COORDINATOR')
  async assignMaintainer(
    @Param('slug') slug: string,
    @Body() body: MaintainerDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.load(slug, true);
    return this.review.assignMaintainer('trail', trail.id, body.maintainerId, user);
  }

  @Post(':slug/assets/:assetId/review')
  @Roles('EDITOR')
  @HttpCode(200)
  async reviewAsset(
    @Param('slug') slug: string,
    @Param('assetId') assetId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.load(slug, true);
    if (!trail.assets.some((asset) => asset.id === assetId)) {
      throw new NotFoundException('That map point is not on this trail.');
    }
    return this.review.markReviewed('asset', assetId, user);
  }

  private async reviewBySlug(slug: string, user: SessionUser) {
    const trail = await this.load(slug, true);
    return this.review.markReviewed('trail', trail.id, user);
  }

  private async load(slug: string, staff: boolean): Promise<TrailRow> {
    const trail = await this.prisma.trail.findUnique({ where: { slug }, include: trailInclude });
    if (!trail) throw new NotFoundException('That trail is not on the map.');
    const published = trail.status === 'PUBLISHED' && trail.visibility === 'PUBLIC';
    if (!published && !staff) throw new NotFoundException('That trail is not on the map.');
    return trail;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    let n = 2;
    while (await this.prisma.trail.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${base}-${n}`;
      n += 1;
    }
    return slug;
  }

  private async requireOrgs(
    dataStewardOrgId: string | null | undefined,
    maintenanceOwnerOrgId: string | null | undefined,
  ) {
    for (const id of [dataStewardOrgId, maintenanceOwnerOrgId]) {
      if (!id) continue;
      const org = await this.prisma.organization.findUnique({ where: { id }, select: { id: true } });
      if (!org) throw new BadRequestException('That organization is not in the directory.');
    }
  }

  private async writeLine(id: string, line: LineString, removeOnFailure: boolean) {
    try {
      await this.prisma.$executeRaw`
        UPDATE "Trail"
        SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(line)}), 4326)::geometry(LineString, 4326)
        WHERE id = ${id}`;
    } catch {
      if (removeOnFailure) await this.prisma.trail.delete({ where: { id } }).catch(() => undefined);
      throw new BadRequestException('That line could not be saved on the map.');
    }
  }

  private async writePoint(id: string, point: GeoPoint, removeOnFailure: boolean) {
    try {
      await this.prisma.$executeRaw`
        UPDATE "Asset"
        SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(point)}), 4326)::geometry(Point, 4326)
        WHERE id = ${id}`;
    } catch {
      if (removeOnFailure) await this.prisma.asset.delete({ where: { id } }).catch(() => undefined);
      throw new BadRequestException('That point could not be saved on the map.');
    }
  }
}

@Module({ imports: [ReviewModule], controllers: [TrailsController] })
export class TrailsModule {}
