import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import bodyParser, { json } from 'body-parser';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { join } from 'path';

async function bootstrap() {
  // const app = await NestFactory.create(AppModule);
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bodyParser: true,
  });

  // Enable CORS

  app.enableCors();

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Serve public/.well-known if needed

  app.use(
    '/.well-known',
    express.static(join(__dirname, '..', 'public', '.well-known')),
  );

  // Health check route
  app.getHttpAdapter().get('/', (req, res) => {
    res.send('✅ Welcome! Your NestJS server is running.');
  });

  // --- Stripe Webhook Route (raw body required) ---
  app.use('/stripe/webhook', bodyParser.raw({ type: '*/*' }));

  // app.use(
  //   '/api/v1/stripe/webhook',
  //   express.raw({ type: 'application/json' }), // raw body for Stripe
  // );

  // // --- Global JSON Parser for all other routes ---

  // app.use(
  //   json({
  //     verify: (req: any, res, buf) => {
  //       if (!req.originalUrl.startsWith('/api/v1/stripe/webhook')) {
  //         req.rawBody = buf;
  //       }
  //     },
  //   }),
  // );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
