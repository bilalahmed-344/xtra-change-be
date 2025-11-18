// src/roundup/roundup-charge.processor.ts
import { Processor, WorkerHost, OnQueueEvent } from '@nestjs/bullmq';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from 'src/stripe/stripe.service';
import { Logger } from '@nestjs/common';

@Processor('roundup-charge')
export class RoundUpChargeProcessor extends WorkerHost {
  private readonly logger = new Logger(RoundUpChargeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {
    super();
  }

  async process(job: any) {
    const { userId } = job.data;
    this.logger.log(`process Processing charge job for user ${userId}`);

    const now = new Date();

    const setting = await this.prisma.roundUpSetting.findUnique({
      where: { userId },
      include: { user: { include: { cards: true } } },
    });
    this.logger.log(`setting`, setting);

    if (!setting) {
      this.logger.warn(`No RoundUpSetting found for user ${userId}`);
      return;
    }

    // if (!setting.nextRunAt || setting.nextRunAt > now) {
    //   this.logger.log(`Not yet charging time for user ${userId}`);
    //   return;
    // }

    // const card = setting.user.cards?.[0];
    // if (!card || !card.stripeCardId) {
    //   this.logger.warn(`No card found for user ${userId}`);
    //   return;
    // }

    const pendingTransactions = await this.prisma.roundUpTransaction.findMany({
      where: { userId, status: 'PENDING' },
    });
    console.log(
      '🚀 ~ RoundUpChargeProcessor ~ process ~ pendingTransactions:',
      pendingTransactions,
    );

    if (!pendingTransactions.length) {
      this.logger.log(`No pending transactions for user ${userId}`);
      return;
    }

    const totalAmount = pendingTransactions.reduce(
      (sum, tx) => sum + tx.roundUpAmount,
      0,
    );
    console.log(
      '🚀 ~ RoundUpChargeProcessor ~ process ~ pendingTransactions:',
      totalAmount,
    );
    // try {
    //   const paymentIntent = await this.stripeService.createPaymentIntent({
    //     amount: Math.round(totalAmount * 100),
    //     customerId: setting.user.stripeCustomerId,
    //     paymentMethodId: card.stripeCardId,
    //   });

    //   const success = paymentIntent.status === 'succeeded';

    //   await this.prisma.$transaction(async (prisma) => {
    //     // Charged transaction
    //     await prisma.chargedTransaction.create({
    //       data: {
    //         userId,
    //         cardId: card.id,
    //         chargedAmount: totalAmount,
    //         status: success ? 'SUCCESS' : 'FAILED',
    //         stripePaymentIntentId: paymentIntent.id,
    //         failureReason: success
    //           ? null
    //           : paymentIntent.last_payment_error?.message,
    //       },
    //     });

    //     // Update round-up transactions
    //     for (const tx of pendingTransactions) {
    //       await prisma.roundUpTransaction.update({
    //         where: { id: tx.id },
    //         data: {
    //           status: success ? 'INVESTED' : 'PENDING',
    //           stripePaymentIntentId: paymentIntent.id,
    //         },
    //       });
    //     }

    //     // Update RoundUpSetting
    //     await prisma.roundUpSetting.update({
    //       where: { id: setting.id },
    //       data: {
    //         lastRunAt: now,
    //         nextRunAt: this.getNextRunDateByFrequency(
    //           setting.paymentFrequency,
    //           now,
    //         ),
    //       },
    //     });
    //   });

    //   this.logger.log(
    //     `✅ Successfully charged user ${userId} $${totalAmount.toFixed(2)}`,
    //   );
    // } catch (error) {

    //   await this.prisma.chargedTransaction.create({
    //     data: {
    //       userId,
    //       cardId: card.stripeCardId,
    //       chargedAmount: totalAmount,
    //       status: 'FAILED',
    //       stripePaymentIntentId: null,
    //       failureReason: error.message || 'Stripe API failure',
    //     },
    //   });
    //   this.logger.error(
    //     `❌ Failed charging user ${userId}: ${error.message}`,
    //     error.stack,
    //   );
    // }
  }

  private getNextRunDateByFrequency(frequency: string, fromDate: Date): Date {
    const next = new Date(fromDate);
    switch (frequency) {
      case 'DAILY':
        next.setDate(next.getDate() + 1);
        break;
      case 'WEEKLY':
        next.setDate(next.getDate() + 7);
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        next.setDate(next.getDate() + 1);
    }
    next.setHours(0, 0, 0, 0);
    return next;
  }

  // job started event
  @OnQueueEvent('active')
  onActive(job: any) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  // job failed event
  @OnQueueEvent('failed')
  onFailed(job: any, err: any) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`);
  }
}
