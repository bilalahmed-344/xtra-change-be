import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { CardsModule } from './cards/cards.module';
import { StripeModule } from './stripe/stripe.module';
import { RoundUpModule } from './round-up/round-up.module';
import { PlaidModule } from './plaid/plaid.module';
import { TwilioModule } from './twilio/twilio.module';
import { RoundupTestModule } from './roundup-test/roundup-test.module';
import { WithdrawModule } from './withdraw/withdraw.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RoundUpTransactionModule } from './round-up-transaction/round-up-transaction.module';
import { IdenfyModule } from './idenfy/idenfy.module';
import { RoundUpChargedModule } from './round-up-charged/round-up-charged.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { S3Module } from './s3/s3.module';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    CardsModule,
    StripeModule,
    RoundUpModule,
    PlaidModule,
    TwilioModule,
    RoundupTestModule,
    WithdrawModule,
    RoundUpTransactionModule,
    IdenfyModule,
    RoundUpChargedModule,
    S3Module,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
    }),
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
