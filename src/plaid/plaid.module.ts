import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PlaidController } from './plaid.controller';
import { PlaidService } from './plaid.service';
import plaidConfig from '../config/plaid.config';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [ConfigModule.forFeature(plaidConfig), PrismaModule],
  controllers: [PlaidController],
  providers: [PlaidService],
  exports: [PlaidService],
})
export class PlaidModule {}
