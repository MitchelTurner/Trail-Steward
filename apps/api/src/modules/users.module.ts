import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { roleAtLeast } from 'shared';
import { UserPatchDto, UserWriteDto } from '../dto';
import { rethrowPrisma } from '../errors';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit.service';
import { CurrentUser, Roles, type SessionUser } from '../session';

@Controller('users')
@Roles('COORDINATOR')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { email: 'asc' },
      include: { organization: { select: { id: true, name: true } } },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      organizationId: user.organizationId,
      organizationName: user.organization?.name ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    }));
  }

  @Post()
  async create(@Body() body: UserWriteDto, @CurrentUser() actor: SessionUser) {
    this.assertRole(actor, body.role ?? 'EDITOR');
    try {
      const created = await this.prisma.user.create({
        data: {
          email: body.email.trim().toLowerCase(),
          name: body.name ?? null,
          role: body.role ?? 'EDITOR',
          organizationId: body.organizationId ?? null,
          isActive: body.isActive ?? true,
        },
      });
      await this.audit.record({
        actorId: actor.id,
        action: 'create',
        entityType: 'user',
        entityId: created.id,
        before: null,
        after: { email: created.email, role: created.role },
      });
      return created;
    } catch (error) {
      rethrowPrisma(error);
    }
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UserPatchDto,
    @CurrentUser() actor: SessionUser,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('User not found.');
    if (existing.role === 'ADMIN' && !roleAtLeast(actor.role, 'ADMIN')) {
      throw new ForbiddenException('Only an admin can change an admin.');
    }
    if (body.role) this.assertRole(actor, body.role);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: body.email?.trim().toLowerCase(),
        name: body.name,
        role: body.role,
        organizationId: body.organizationId,
        isActive: body.isActive,
      },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'update',
      entityType: 'user',
      entityId: id,
      before: {
        role: existing.role,
        isActive: existing.isActive,
        organizationId: existing.organizationId,
      },
      after: {
        role: updated.role,
        isActive: updated.isActive,
        organizationId: updated.organizationId,
      },
    });
    return updated;
  }

  private assertRole(actor: SessionUser, role: SessionUser['role']): void {
    if (role === 'ADMIN' && !roleAtLeast(actor.role, 'ADMIN')) {
      throw new ForbiddenException('Only an admin can assign the admin role.');
    }
  }
}

@Module({ controllers: [UsersController] })
export class UsersModule {}
