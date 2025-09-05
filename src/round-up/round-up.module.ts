import { Module } from '@nestjs/common';
import { RoundUpService } from './round-up.service';
import { RoundUpController } from './round-up.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RoundUpController],
  providers: [RoundUpService],
  exports: [RoundUpService],
})
export class RoundUpModule {}
