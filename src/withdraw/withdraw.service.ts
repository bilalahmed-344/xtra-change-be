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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException('User not found');

    if (dto.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be positive');
    }

    // Check user balance (implement your balance logic) TODO

    // Ensure user has a Stripe Connect account

    try {
      // const bankDetails = {
      //   account_holder_name: dto.name,
      //   account_holder_type: 'individual',
      //   routing_number: dto.routingNumber,
      //   account_number: dto.accountNumber,
      // };
      const connectAccountId =
        await this.stripeService.getOrCreateConnectAccount(
          user.id,
          ipAddress,
          dto,
        );

      // Attach bank account to the connect account (Stripe: external account) 527 account type
      // const bankAccount = await this.stripeService.addExternalBankAccount(
      //   connectAccountId,
      //   {
      //     name: dto.name,
      //     routingNumber: dto.routingNumber,
      //     accountNumber: dto.accountNumber,
      //   },
      // );

      // Step 2: (Test Mode Only) Add fake funds to Express account
      if (process.env.NODE_ENV !== 'production') {
        await this.stripeService.createTestFunding(connectAccountId);
      }

      // // Create payout (amount is provided in main currency unit)
      // const payout = await this.stripeService.createPayout(
      //   connectAccountId,
      //   dto.amount,
      // );

      // console.log('🚀 ~ WithdrawService ~ requestWithdrawal ~ payout:', payout);

      // // Persist withdrawal record
      // const withdrawal = await this.prisma.withdrawal.create({
      //   data: {
      //     userId,
      //     amount: dto.amount,
      //     status: 'PROCESSING',
      //     failureReason: null,
      //     stripePayoutId: payout.id,
      //     stripeAccountId: connectAccountId,
      //     requestedAt: new Date(),
      //     processedAt: new Date(),
      //   },
      // });

      // return {
      //   success: true,
      //   message: 'Withdrawal request submitted successfully',
      //   withdrawal,
      //   payout,
      // };
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
          requestedAt: new Date(),
        },
      });

      throw new BadRequestException({
        message: 'Withdrawal request failed',
        reason: error.message,
        withdrawal: failedWithdrawal,
      });
    }
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
