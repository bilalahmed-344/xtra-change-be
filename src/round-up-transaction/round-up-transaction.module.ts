import { Module } from '@nestjs/common';
import { RoundUpTransactionService } from './round-up-transaction.service';
import { RoundUpTransactionController } from './round-up-transaction.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PlaidModule } from 'src/plaid/plaid.module';

@Module({
  imports: [PrismaModule, PlaidModule],
  controllers: [RoundUpTransactionController],
  providers: [RoundUpTransactionService],
})
export class RoundUpTransactionModule {}
