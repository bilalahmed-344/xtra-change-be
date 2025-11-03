import { Module } from '@nestjs/common';
import { RoundUpChargedService } from './round-up-charged.service';
import { RoundUpChargedController } from './round-up-charged.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RoundUpChargedController],
  providers: [RoundUpChargedService],
})
export class RoundUpChargedModule {}
