import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlaidController } from './plaid.controller';
import { PlaidService } from './plaid.service';
import plaidConfig from '../config/plaid.config';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlaidTransactionsJob } from 'src/jobs/PlaidTransactions.job';
import { StripeService } from 'src/stripe/stripe.service';
import { RoundUpChargedService } from 'src/round-up-charged/round-up-charged.service';
import { RoundUpChargedModule } from 'src/round-up-charged/round-up-charged.module';
import { NotificationsService } from 'src/notifications/notifications.service';

@Module({
  imports: [
    ConfigModule.forFeature(plaidConfig),
    PrismaModule,
    RoundUpChargedModule,
  ],
  controllers: [PlaidController],
  providers: [
    PlaidService,
    PlaidTransactionsJob,
    StripeService,
    RoundUpChargedService,
    NotificationsService,
  ],
  exports: [PlaidService],
})
export class PlaidModule {}
