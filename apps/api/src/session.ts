import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { ServerEnv, userRoles } from 'shared';
import { roleAtLeast } from 'shared';
import { PrismaService } from './prisma.service';
import { ENV } from './tokens';

export const ROLES_KEY = 'roles';
export const Roles = (role: (typeof userRoles)[number]) => SetMetadata(ROLES_KEY, role);

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: (typeof userRoles)[number];
  organizationId: string | null;
};

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    return request.user;
  },
);

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: SessionUser }>();
    request.user = await this.readUser(request);
    const required = this.reflector.getAllAndOverride<(typeof userRoles)[number] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;
    if (!request.user) throw new UnauthorizedException();
    if (!roleAtLeast(request.user.role, required)) throw new ForbiddenException();
    return true;
  }

  private async readUser(request: Request): Promise<SessionUser | undefined> {
    const token = request.cookies?.ts_session;
    if (typeof token !== 'string' || !token) return undefined;
    try {
      const payload = jwt.verify(token, this.env.JWT_SECRET);
      if (typeof payload === 'string' || typeof payload.sub !== 'string') return undefined;
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) return undefined;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
      };
    } catch {
      return undefined;
    }
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie('ts_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie('ts_session', { path: '/' });
}
