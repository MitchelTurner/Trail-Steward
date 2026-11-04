import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { loadServerEnv, type ServerEnv } from 'shared';
import { AdminModule } from './modules/admin.module';
import { AuditModule } from './modules/audit.module';
import { AuthModule } from './modules/auth.module';
import { ChecklistsModule } from './modules/checklists.module';
import { HealthModule } from './modules/health.module';
import { IssuesModule } from './modules/issues.module';
import { MaintenanceModule } from './modules/maintenance.module';
import { OrganizationsModule } from './modules/organizations.module';
import { PathwaysModule } from './modules/pathways.module';
import { PlayersModule } from './modules/players.module';
import { ResourcesModule } from './modules/resources.module';
import { ReviewModule } from './modules/review.module';
import { SearchModule } from './modules/search.module';
import { SuggestionsModule } from './modules/suggestions.module';
import { TopicsModule } from './modules/topics.module';
import { TrailsModule } from './modules/trails.module';
import { UsersModule } from './modules/users.module';
import { AuditService } from './audit.service';
import { EmailService } from './email.service';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { SessionGuard } from './session';
import { ENV, redisOptions } from './tokens';

const testMode = process.env.NODE_ENV === 'test';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadServerEnv() },
    PrismaService,
    RedisService,
    AuditService,
    EmailService,
  ],
  exports: [ENV, PrismaService, RedisService, AuditService, EmailService],
})
export class CoreModule {}

@Module({
  imports: [
    CoreModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: testMode ? 'silent' : 'info',
        redact: {
          paths: ['req.headers.cookie', 'req.headers.authorization', 'req.body.token'],
          remove: true,
        },
        serializers: {
          req(request: { id?: string; method?: string; url?: string }) {
            const url = String(request.url ?? '')
              .replace(/\/checklists\/[^/?]+/g, '/checklists/:token')
              .replace(/token=[^&]+/g, 'token=:token');
            return { id: request.id, method: request.method, url };
          },
        },
      },
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: testMode ? 10_000 : 120 }]),
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [ENV],
      useFactory: (env: ServerEnv) => ({ connection: redisOptions(env.REDIS_URL) }),
    }),
    HealthModule,
    TopicsModule,
    SearchModule,
    OrganizationsModule,
    PlayersModule,
    ResourcesModule,
    PathwaysModule,
    TrailsModule,
    IssuesModule,
    MaintenanceModule,
    ChecklistsModule,
    SuggestionsModule,
    AuthModule,
    ReviewModule,
    AuditModule,
    UsersModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
})
export class AppModule {}

// Later: trail counters. File storage is still not in this app.
