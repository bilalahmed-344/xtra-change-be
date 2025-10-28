import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
} from '@nestjs/common';
import { RoundUpTransactionService } from './round-up-transaction.service';

@Controller('round-up-transaction')
export class RoundUpTransactionController {
  constructor(
    private readonly roundUpTransactionService: RoundUpTransactionService,
  ) {}

  @Get('total-savings')
  async getTotalSavings(@Req() req) {
    const userId = req.user.id;
    return this.roundUpTransactionService.getTotalSavings(userId);
  }
  @Get('savings')
  async getSavingsByFrequency(@Req() req) {
    const userId = req.user.id;
    return this.roundUpTransactionService.getSavingsByFrequency(userId);
  }
  @Get('all')
  async getAllTransactions(
    @Req() req,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    const userId = req.user.id;
    return this.roundUpTransactionService.getAllTransactions(
      userId,
      Number(page),
      Number(limit),
    );
  }
}
