import { Injectable, Logger } from '@nestjs/common';
import { RoundUpStatus } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from 'src/stripe/stripe.service';

@Injectable()
export class RoundupTestService {
  private readonly logger = new Logger(RoundupTestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async processPendingRoundUps() {
    this.logger.log('🔄 Processing pending roundups...');

    const users = await this.prisma.user.findMany({
      include: { cards: true },
    });

    for (const user of users) {
      const pending = await this.prisma.roundUpTransaction.findMany({
        where: { userId: user.id, status: 'PENDING' },
      });

      if (pending.length === 0) continue;

      const totalAmount = pending.reduce(
        (sum, trx) => sum + trx.roundUpAmount,
        0,
      );

      this.logger.warn(`⚠️ ${totalAmount}`);

      // Find default card
      const defaultCard = user.cards.find((c) => c.isDefault);
      if (!defaultCard) {
        this.logger.warn(`⚠️ No default card for user ${user.id}`);
        continue;
      }

      if (!user.stripeCustomerId) {
        this.logger.error(`❌ No Stripe customer for user ${user.id}`);
        continue;
      }
      try {
        // Charge card
        const paymentIntent = await this.stripeService.chargeCard({
          customerId: user.stripeCustomerId,
          cardId: defaultCard.stripeCardId,
          amount: Math.round(totalAmount * 100), // cents
        });

        // Mark all pending as invested
        await this.prisma.roundUpTransaction.updateMany({
          where: { userId: user.id, status: 'PENDING' },
          data: { status: 'INVESTED' },
        });
        return paymentIntent;
      } catch (err) {
        this.logger.error(
          `❌ Failed to charge user ${user.id}: ${err.message}`,
        );

        let status: RoundUpStatus = 'FAILED';
        let reason: string | null = err.raw?.code || err.message;

        if (err.raw?.code === 'insufficient_funds') {
          status = 'INSUFFICIENT_FUNDS';
        } else if (err.raw?.code === 'card_declined') {
          status = 'CARD_DECLINED';
        }

        await this.prisma.roundUpTransaction.updateMany({
          where: { userId: user.id, status: 'PENDING' },
          data: {
            status,
            failureReason: reason,
          },
        });
      }
    }
  }
}
