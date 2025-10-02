import { Module } from '@nestjs/common';
import { WithdrawService } from './withdraw.service';
import { WithdrawController } from './withdraw.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StripeService } from 'src/stripe/stripe.service';

@Module({
  imports: [PrismaModule],
  controllers: [WithdrawController],
  providers: [WithdrawService, StripeService],
  exports: [WithdrawService],
})
export class WithdrawModule {}
