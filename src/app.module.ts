import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { MulterModule } from '@nestjs/platform-express';
import { CloudinaryConfigService } from './cloudinary/cloudinary.provider';
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
@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    MulterModule.registerAsync({
      useClass: CloudinaryConfigService,
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
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/',
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
