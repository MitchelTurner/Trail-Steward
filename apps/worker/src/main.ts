import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadServerEnv } from 'shared';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  try {
    loadServerEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  app.enableShutdownHooks();
  Logger.log('Worker is running', 'Bootstrap');
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
