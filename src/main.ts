import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Standalone entry point: boots the registry (and, as they land, signals,
 * model and delivery) modules as one process. sentinel-stack imports these
 * same modules alongside EhrBridgeModule for the composed reference
 * deployment; this file is what runs when sentinel is deployed on its own.
 */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const port = process.env.PORT ?? 3100;
  const logger = new Logger('Bootstrap');

  await app.listen(port, '0.0.0.0');
  logger.log(`Sentinel listening on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
