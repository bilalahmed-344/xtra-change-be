import { BadRequestException, Controller, Get, Req } from '@nestjs/common';
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
}
