import { Controller, Post } from '@nestjs/common';
import { RoundupTestService } from './roundup-test.service';

@Controller('roundup-test')
export class RoundupTestController {
  constructor(private readonly roundupTestService: RoundupTestService) {}

  // Manually trigger processing of pending roundups
  @Post('process')
  async processPendingRoundUps() {
    const res = await this.roundupTestService.processPendingRoundUps();
    return { message: '✅ Round-up processing executed manually', res };
  }
}
