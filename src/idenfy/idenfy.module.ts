import { Module } from '@nestjs/common';
import { IdenfyService } from './idenfy.service';
import { IdenfyController } from './idenfy.controller';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  imports: [HttpModule],
  controllers: [IdenfyController],
  providers: [IdenfyService, PrismaService],
})
export class IdenfyModule {}
