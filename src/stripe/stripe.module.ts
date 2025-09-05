import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StripeService } from './stripe.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [StripeService, PrismaService],
  exports: [StripeService],
})
export class StripeModule {}
