import { Controller } from '@nestjs/common';
import { WithdrawService } from './withdraw.service';

@Controller('withdraw')
export class WithdrawController {
  constructor(private readonly withdrawService: WithdrawService) {}
}
