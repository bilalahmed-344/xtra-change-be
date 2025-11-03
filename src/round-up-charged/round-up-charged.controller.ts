import { Controller, Get, Query, Req } from '@nestjs/common';
import { RoundUpChargedService } from './round-up-charged.service';

@Controller('round-up-charged')
export class RoundUpChargedController {
  constructor(private readonly roundUpChargedService: RoundUpChargedService) {}

  @Get()
  async getAllChargedTransactions(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = req.user.id;
    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 10;

    return this.roundUpChargedService.getAllChargedTransactions({
      userId,
      page: pageNumber,
      limit: pageSize,
      startDate,
      endDate,
    });
  }
}
