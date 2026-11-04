import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuditService } from '../audit.service';
import { CounterPatchDto, CounterReadingDto, CounterWriteDto, MaintainerDto } from '../dto';
import { blankToNull } from '../present';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

function dayStamp(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Controller('trails/:slug/counters')
export class CountersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ReviewService,
  ) {}

  @Post()
  @Roles('EDITOR')
  @HttpCode(201)
  async create(
    @Param('slug') slug: string,
    @Body() body: CounterWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.trail(slug);
    const counter = await this.prisma.counter.create({
      data: {
        trailId: trail.id,
        name: body.name,
        kind: body.kind,
        notes: blankToNull(body.notes) ?? null,
        reviewIntervalDays: body.reviewIntervalDays ?? 365,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'create',
      entityType: 'counter',
      entityId: counter.id,
      after: { name: counter.name, trailId: trail.id },
    });
    return { id: counter.id };
  }

  @Patch(':id')
  @Roles('EDITOR')
  async update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: CounterPatchDto,
    @CurrentUser() user: SessionUser,
  ) {
    const counter = await this.counter(slug, id);
    const updated = await this.prisma.counter.update({
      where: { id },
      data: {
        name: body.name,
        kind: body.kind,
        notes: body.notes === undefined ? undefined : (blankToNull(body.notes) ?? null),
        reviewIntervalDays: body.reviewIntervalDays,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'counter',
      entityId: id,
      before: { name: counter.name },
      after: { name: updated.name },
    });
    return { id: updated.id, name: updated.name };
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(204)
  async remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ) {
    const counter = await this.counter(slug, id);
    await this.prisma.counter.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'counter',
      entityId: id,
      before: { name: counter.name },
      after: null,
    });
  }

  @Post(':id/readings')
  @Roles('EDITOR')
  @HttpCode(201)
  async addReading(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: CounterReadingDto,
    @CurrentUser() user: SessionUser,
  ) {
    const counter = await this.counter(slug, id);
    const reading = await this.prisma.counterReading.create({
      data: {
        counterId: counter.id,
        recordedOn: new Date(`${body.recordedOn}T00:00:00.000Z`),
        count: body.count,
        notes: blankToNull(body.notes) ?? null,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'create',
      entityType: 'counterReading',
      entityId: reading.id,
      after: { counterId: counter.id, count: body.count, recordedOn: body.recordedOn },
    });
    return { id: reading.id, recordedOn: dayStamp(reading.recordedOn), count: reading.count };
  }

  @Delete(':id/readings/:readingId')
  @Roles('EDITOR')
  @HttpCode(204)
  async removeReading(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Param('readingId') readingId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const counter = await this.counter(slug, id);
    const reading = await this.prisma.counterReading.findFirst({
      where: { id: readingId, counterId: counter.id },
    });
    if (!reading) throw new NotFoundException('That count is not on this counter.');
    await this.prisma.counterReading.delete({ where: { id: readingId } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'counterReading',
      entityId: readingId,
      before: { count: reading.count },
      after: null,
    });
  }

  @Post(':id/review')
  @Roles('EDITOR')
  @HttpCode(200)
  reviewNow(@Param('slug') slug: string, @Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.reviewMarked(slug, id, user);
  }

  @Patch(':id/maintainer')
  @Roles('COORDINATOR')
  async assignMaintainer(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: MaintainerDto,
    @CurrentUser() user: SessionUser,
  ) {
    const counter = await this.counter(slug, id);
    return this.review.assignMaintainer('counter', counter.id, body.maintainerId, user);
  }

  private async reviewMarked(slug: string, id: string, user: SessionUser) {
    const counter = await this.counter(slug, id);
    return this.review.markReviewed('counter', counter.id, user);
  }

  private async trail(slug: string) {
    const trail = await this.prisma.trail.findUnique({ where: { slug }, select: { id: true } });
    if (!trail) throw new NotFoundException('That trail is not on the map.');
    return trail;
  }

  private async counter(slug: string, id: string) {
    const trail = await this.trail(slug);
    const counter = await this.prisma.counter.findFirst({ where: { id, trailId: trail.id } });
    if (!counter) throw new NotFoundException('That counter is not on this trail.');
    return counter;
  }
}

@Module({ imports: [ReviewModule], controllers: [CountersController] })
export class CountersModule {}
