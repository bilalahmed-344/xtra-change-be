import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeWebhookController } from './stripe.webhook.controller';
import { BullModule } from '@nestjs/bullmq';
import { WithdrawalProcessorWorker } from './queues/withdrawal-processor.worker';
import { StripeWithdrawalProcessor } from './queues/stripe-withdrawal-processor.service';

@Module({
  controllers: [StripeWebhookController],
  imports: [
    ConfigModule,
    PrismaModule,
    BullModule.registerQueue({
      name: 'withdrawal-queue',
    }),
  ],
  providers: [
    StripeService,
    PrismaService,
    WithdrawalProcessorWorker,
    StripeWithdrawalProcessor,
  ],
  exports: [StripeService, StripeWithdrawalProcessor],
})
export class StripeModule {}
