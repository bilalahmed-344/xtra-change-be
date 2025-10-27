import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { WithdrawService } from './withdraw.service';
import { WithdrawDto } from './dtos/withdraw.dto';

@Controller('withdraw')
export class WithdrawController {
  constructor(private readonly withdrawService: WithdrawService) {}

  @Post('/request')
  async requestWithdrawal(@Req() req, @Body() dto: WithdrawDto) {
    const userId = req.user.id;
    return this.withdrawService.requestWithdrawal(userId, dto);
  }

  @Post(':id/check-status')
  async checkStatus(@Param('id') id: string) {
    return this.withdrawService.checkWithdrawalStatus(id);
  }
}
