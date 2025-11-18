import { Module } from '@nestjs/common';
import { RoundUpChargedService } from './round-up-charged.service';
import { RoundUpChargedController } from './round-up-charged.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BullModule } from '@nestjs/bullmq';
import { StripeService } from 'src/stripe/stripe.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { RoundUpChargeProcessor } from './roundup-charge.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'roundup-charge',
    }),
    PrismaModule,
  ],
  controllers: [RoundUpChargedController],
  providers: [
    RoundUpChargedService,
    StripeService,
    PrismaService,
    RoundUpChargeProcessor,
  ],
  exports: [RoundUpChargedService, BullModule],
})
export class RoundUpChargedModule {}
