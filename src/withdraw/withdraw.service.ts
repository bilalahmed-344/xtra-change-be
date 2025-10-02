import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from 'src/stripe/stripe.service';

export interface WithdrawDto {
  name: string;
  routingNumber: string;
  accountNumber: string;
  amount: number;
}

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Request a withdrawal
   */
  async requestWithdrawal(userId: string, dto: WithdrawDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (dto.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }

    // 1. Ensure user has a Stripe Connect account
    const connectAccountId = await this.stripeService.getOrCreateConnectAccount(
      user.id,
    );

    try {
      // 2. Attach bank account
      await this.stripeService.addExternalBankAccount(connectAccountId, {
        name: dto.name,
        routingNumber: dto.routingNumber,
        accountNumber: dto.accountNumber,
      });

      // 3. Create payout
      const payout = await this.stripeService.createPayout(
        connectAccountId,
        dto.amount,
      );

      // 4. Save withdrawal in DB
      const withdrawal = await this.prisma.withdrawal.create({
        data: {
          userId,
          amount: dto.amount,
          status: 'PROCESSING',
          failureReason: null,
          // optional: store payoutId for tracking
          // stripePayoutId: payout.id,
        },
      });

      this.logger.log(
        `💸 Withdrawal requested: $${dto.amount} for user ${userId}`,
      );

      return {
        success: true,
        message: 'Withdrawal request submitted successfully',
        withdrawal,
        payout,
      };
    } catch (error) {
      this.logger.error(
        `❌ Withdrawal failed for user ${userId}: ${error.message}`,
      );

      // Save failed attempt in DB
      const failedWithdrawal = await this.prisma.withdrawal.create({
        data: {
          userId,
          amount: dto.amount,
          status: 'FAILED',
          failureReason: error.message,
        },
      });

      throw new BadRequestException({
        message: 'Withdrawal request failed',
        reason: error.message,
        withdrawal: failedWithdrawal,
      });
    }
  }
}
