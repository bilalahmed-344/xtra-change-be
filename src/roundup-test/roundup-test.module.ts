import { Module } from '@nestjs/common';
import { RoundupTestService } from './roundup-test.service';
import { RoundupTestController } from './roundup-test.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { StripeModule } from 'src/stripe/stripe.module';

@Module({
  imports: [PrismaModule, StripeModule],
  controllers: [RoundupTestController],
  providers: [RoundupTestService],
})
export class RoundupTestModule {}
