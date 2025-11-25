import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from 'src/stripe/stripe.service';
import { WithdrawDto } from './dtos/withdraw.dto';

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async requestWithdrawal(userId: string, dto: WithdrawDto, ipAddress: string) {
    // 1. Validate user
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) throw new NotFoundException('User not found');

    if (dto.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }

    // 2. Ensure user has a Stripe Connect Account

    const connectAccountId = await this.stripeService.getOrCreateConnectAccount(
      userId,
      ipAddress,
      // dto,
    );

    if (!connectAccountId) {
      throw new BadRequestException('Stripe Connect account not created.');
    }

    if (dto.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }

    //  Attach bank account (idempotent)
    try {
      await this.stripeService.attachBankAccount(connectAccountId, dto);
    } catch (error) {
      console.error('Bank attach error:', error);
      throw new BadRequestException(
        error?.message || 'Failed to attach bank account',
      );
    }

    // TODO

    // if (user.walletBalance < dto.amount) {
    //   throw new BadRequestException('Insufficient wallet balance');
    // }

    //  Create withdrawal with PENDING status
    const withdrawal = await this.prisma.withdrawal.create({
      data: {
        userId,
        amount: dto.amount,
        status: 'PENDING',
        stripeAccountId: connectAccountId,
        requestedAt: new Date(),
      },
    });

    return {
      success: true,
      message:
        'Withdrawal request is pending. Once your Stripe account is verified, payouts will process automatically.',
      withdrawal,
    };
  }

  async checkWithdrawalStatus(withdrawalId: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
    });

    if (!withdrawal) throw new NotFoundException('Withdrawal not found');
    if (!withdrawal.stripePayoutId || !withdrawal.stripeAccountId) {
      throw new BadRequestException('Missing payout or account details');
    }

    const payout = await this.stripeService.retrievePayout(
      withdrawal.stripeAccountId,
      withdrawal.stripePayoutId,
    );

    let newStatus = withdrawal.status;
    let completedAt = withdrawal.completedAt;
    let failureReason = withdrawal.failureReason;

    switch (payout.status) {
      case 'paid':
        newStatus = 'COMPLETED';
        completedAt = new Date();
        break;
      case 'failed':
      case 'canceled':
        newStatus = 'FAILED';
        failureReason =
          typeof payout.failure_balance_transaction === 'string'
            ? payout.failure_balance_transaction
            : payout.failure_message || null;
        break;
      default:
        newStatus = 'PROCESSING';
    }

    const updated = await this.prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: newStatus,
        completedAt,
        failureReason,
      },
    });

    return {
      message: `Withdrawal status updated to ${newStatus}`,
      payout,
      updated,
    };
  }
}
