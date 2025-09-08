import { Controller, Get, Post, Body, Req } from '@nestjs/common';

import { RoundUpService } from './round-up.service';
import { CreateRoundUpDto } from './dto/create-round-up.dto';

@Controller('round-up')
export class RoundUpController {
  constructor(private readonly roundUpService: RoundUpService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateRoundUpDto) {
    const userId = req.user.id;
    return this.roundUpService.createOrUpdate(userId, dto);
  }
  @Get()
  async find(@Req() req) {
    const userId = req.user.id;
    return this.roundUpService.findByUser(userId);
  }
}
