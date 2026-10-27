import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { TransformInterceptor, AllExceptionsFilter } from './common/http';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api/v1');
  // Em producao a API fica atras do proxy do Easypanel (e da web, na imagem unica): o IP
  // da conexao e o do proxy. Sem isto o limite de requisicoes por IP trataria todos os
  // usuarios como um so; o proxy informa o IP real em X-Forwarded-For.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', true);

  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',');
  app.enableCors({ origin: origins, credentials: true });

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.API_PORT ?? 3333);
  await app.listen(port);
  new Logger('Bootstrap').log(`FORMAREDE API em http://localhost:${port}/api/v1`);
}

bootstrap();
