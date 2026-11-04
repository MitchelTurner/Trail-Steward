import 'reflect-metadata';
import { Logger, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { ServerEnv } from 'shared';
import { loadServerEnv } from 'shared';
import { AppModule } from './app.module';
import { ENV } from './tokens';

export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  const env = app.get<ServerEnv>(ENV);
  app.enableCors({ origin: env.APP_BASE_URL, credentials: true });
  const adapter = app.getHttpAdapter().getInstance() as {
    set: (key: string, value: number) => void;
  };
  adapter.set('trust proxy', 1);
}

async function bootstrap(): Promise<void> {
  try {
    loadServerEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  configureHttp(app);
  const env = app.get<ServerEnv>(ENV);
  const port = env.PORT ?? 3000;
  await app.listen(port);
  Logger.log(`API listening on ${port}`, 'Bootstrap');
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
