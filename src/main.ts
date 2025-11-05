import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import bodyParser, { json } from 'body-parser';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    json({
      verify: (req: any, res, buf, encoding) => {
        try {
          req.rawBody = buf;
        } catch (err) {
          throw new Error('Invalid body');
        }
      },
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.use(
    '/.well-known',
    express.static(join(__dirname, '..', 'public', '.well-known')),
  );

  app.getHttpAdapter().get('/', (req, res) => {
    res.send('✅ Welcome! Your NestJS server is running.');
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
