// src/jobs/roundup.job.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class RoundUpJob {
  private readonly logger = new Logger(RoundUpJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processRoundUps() {
    this.logger.log('🔄 Starting RoundUp background job...');

    const users = await this.prisma.user.findMany({
      include: {
        roundUpSetting: true,
        cards: true,
      },
    });

    for (const user of users) {
      const setting = user.roundUpSetting;
      if (!setting || !setting.enabled) continue;

      if (!this.shouldProcess(setting.paymentFrequency)) continue;

      const pending = await this.prisma.roundUpTransaction.findMany({
        where: { userId: user.id, status: 'PENDING' },
      });

      if (pending.length === 0) continue;

      const totalAmount = pending.reduce(
        (sum, trx) => sum + trx.roundUpAmount,
        0,
      );

      if (setting.roundUpLimit && totalAmount > setting.roundUpLimit) {
        this.logger.warn(
          `⚠️ Skipping user ${user.id}: round-up total exceeds limit.`,
        );
        continue;
      }

      // find default card
      const defaultCard = user.cards.find((c) => c.isDefault);
      if (!defaultCard) {
        this.logger.warn(`⚠️ No default card for user ${user.id}`);
        continue;
      }

      if (!user.stripeCustomerId) {
        throw new Error('Stripe customer not found for user');
      }

      try {
        // Charge the default card
        await this.stripeService.chargeCard({
          customerId: user.stripeCustomerId,
          cardId: defaultCard.stripeCardId,
          amount: Math.round(totalAmount * 100), // cents
        });

        // update roundups
        await this.prisma.roundUpTransaction.updateMany({
          where: { userId: user.id, status: 'PENDING' },
          data: { status: 'INVESTED' },
        });

        this.logger.log(
          `✅ Charged ${totalAmount} from ${user.id} (card: ${defaultCard.last4})`,
        );
      } catch (err) {
        this.logger.error(
          `❌ Failed to charge user ${user.id}: ${err.message}`,
        );

        await this.prisma.roundUpTransaction.updateMany({
          where: { userId: user.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        });
      }
    }
  }

  private shouldProcess(frequency: string): boolean {
    const today = new Date();

    switch (frequency) {
      case 'DAILY':
        return true;
      case 'WEEKLY':
        return today.getDay() === 0;
      case 'MONTHLY':
        return today.getDate() === 1;
      default:
        return false;
    }
  }
}
