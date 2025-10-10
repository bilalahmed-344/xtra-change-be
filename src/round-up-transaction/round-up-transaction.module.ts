import { Module } from '@nestjs/common';
import { RoundUpTransactionService } from './round-up-transaction.service';
import { RoundUpTransactionController } from './round-up-transaction.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RoundUpTransactionController],
  providers: [RoundUpTransactionService],
})
export class RoundUpTransactionModule {}
