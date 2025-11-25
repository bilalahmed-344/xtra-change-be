import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StripeWithdrawalProcessor {
  private stripe: Stripe;
  private readonly logger = new Logger(StripeWithdrawalProcessor.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new InternalServerErrorException(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil' as any,
    });
  }

  async processWithdrawal(withdrawalId: string) {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
    });
    if (!withdrawal) {
      this.logger.error(`Withdrawal ${withdrawalId} not found`);
      return;
    }

    if (!withdrawal.stripeAccountId) {
      await this.prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'FAILED', failureReason: 'Missing stripeAccountId' },
      });
      this.logger.error(`Withdrawal ${withdrawalId} missing stripeAccountId`);
      return;
    }

    try {
      const amountInCents = Math.round(withdrawal.amount * 100);

      // Create transfer: platform → connected account
      const transfer = await this.stripe.transfers.create({
        amount: amountInCents,
        currency: 'usd',
        destination: withdrawal.stripeAccountId,
        metadata: { withdrawalId },
      });

      // Create payout: connected account → bank
      const payout = await this.stripe.payouts.create(
        { amount: amountInCents, currency: 'usd' },
        { stripeAccount: withdrawal.stripeAccountId },
      );

      await this.prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'PROCESSING',
          stripeTransferId: transfer.id,
          stripePayoutId: payout.id,
          processedAt: new Date(),
        },
      });

      this.logger.log(
        `Processed withdrawal ${withdrawalId}: transfer ${transfer.id}, payout ${payout.id}`,
      );
    } catch (err: any) {
      await this.prisma.withdrawal.update({
        where: { id: withdrawalId },
        data: { status: 'FAILED', failureReason: err.message },
      });
      this.logger.error(
        `Failed to process withdrawal ${withdrawalId}: ${err.message}`,
      );
    }
  }
}
