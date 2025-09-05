import { Module } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeModule } from 'src/stripe/stripe.module';

@Module({
  imports: [PrismaModule, StripeModule],
  controllers: [CardsController],
  providers: [CardsService, PrismaService],
  exports: [CardsService],
})
export class CardsModule {}
