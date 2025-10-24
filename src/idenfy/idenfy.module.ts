import { Module } from '@nestjs/common';
import { IdenfyService } from './idenfy.service';
import { IdenfyController } from './idenfy.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  controllers: [IdenfyController],
  providers: [IdenfyService],
})
export class IdenfyModule {}
