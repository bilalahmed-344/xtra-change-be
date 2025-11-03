import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  TransactionsGetRequest,
} from 'plaid';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from 'src/stripe/stripe.service';
import { decrypt } from 'src/utils/crypto.util';
import { calculateRoundUp, toCents } from 'src/utils/roundup';

@Injectable()
export class PlaidTransactionsJob {
  private readonly logger = new Logger(PlaidTransactionsJob.name);
  private plaidClient: PlaidApi;

  constructor(
    private readonly prisma: PrismaService,
    private configService: ConfigService,
    private readonly stripeService: StripeService,
  ) {
    const configuration = new Configuration({
      basePath: this.getPlaidEnvironment(),
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.configService.get<string>('plaid.clientId'),
          'PLAID-SECRET': this.configService.get<string>('plaid.secret'),
        },
      },
    });

    this.plaidClient = new PlaidApi(configuration);
  }

  private getPlaidEnvironment() {
    const env = this.configService.get<string>('plaid.env');
    switch (env) {
      case 'sandbox':
        return PlaidEnvironments.sandbox;
      case 'development':
        return PlaidEnvironments.development;
      case 'production':
        return PlaidEnvironments.production;
      default:
        return PlaidEnvironments.sandbox;
    }
  }

  // Run every 6 hours (you can change this)
  //   @Cron(CronExpression.EVERY_6_HOURS)
  @Cron(CronExpression.EVERY_MINUTE)
  async syncAllUserTransactions() {
    this.logger.log('🔄 Starting Plaid transactions sync job...');
    const users = await this.prisma.user.findMany({
      include: {
        plaidItems: true,
        roundUpSetting: true,
        cards: { where: { isDefault: true } },
      },
    });

    for (const user of users) {
      const defaultCard = user.cards[0];
      if (!defaultCard) {
        this.logger.warn(`⚠️ User ${user.id} has no default card, skipping.`);
        continue;
      }

      for (const item of user.plaidItems) {
        try {
          const accessToken = decrypt(item.accessToken);
          await this.syncTransactionsForItem(user, accessToken, defaultCard);
        } catch (err) {
          this.logger.error(
            `❌ Failed to sync transactions for ${user.id}`,
            err,
          );
        }
      }
    }

    this.logger.log('✅ Finished Plaid transactions sync job.');
  }

  private async syncTransactionsForItem(
    user: any,
    accessToken: string,
    card: any,
  ) {
    const { id: userId } = user;
    const roundUpSetting = await this.prisma.roundUpSetting.findUnique({
      where: { userId },
    });

    if (!roundUpSetting || !roundUpSetting.enabled) return;

    const now = new Date();
    const nextRunAt = this.getNextRunDateByFrequency(
      roundUpSetting.paymentFrequency,
      now,
    );

    await this.prisma.roundUpSetting.update({
      where: { userId },
      data: {
        lastRunAt: now,
        nextRunAt,
      },
    });

    const startDateObj = this.getStartDateByFrequency(
      roundUpSetting.paymentFrequency,
    );
    const endDateObj = new Date();

    // const startDate = startDateObj.toISOString().split('T')[0];
    // const endDate = endDateObj.toISOString().split('T')[0];

    const endDate = new Date().toISOString().split('T')[0];

    // 2 years ago from today
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    const startDate = start.toISOString().split('T')[0];

    const request: TransactionsGetRequest = {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
    };

    const response = await this.plaidClient.transactionsGet(request);
    const transactions = response.data.transactions || [];
    // Calculate all roundups for this frequency period
    const allRoundUps: { tx: any; roundUpAmount: number }[] = [];

    for (const tx of transactions) {
      if (tx.amount <= 0 || Number.isInteger(tx.amount)) continue;

      const roundUpCents = calculateRoundUp(toCents(tx.amount));
      const roundUpAmount = roundUpCents / 100;
      if (roundUpAmount > 0) {
        allRoundUps.push({ tx, roundUpAmount });
      }
    }

    if (allRoundUps.length === 0) return;

    // Calculate total roundups this period
    const totalRoundUp = allRoundUps.reduce(
      (sum, r) => sum + r.roundUpAmount,
      0,
    );
    const roundUpLimit = roundUpSetting.roundUpLimit ?? Infinity;
    let remainingLimit = roundUpLimit;

    if (totalRoundUp <= 0) return;

    try {
      const paymentIntent = await this.stripeService.createPaymentIntent({
        amount: Math.round(totalRoundUp * 100),
        customerId: user.stripeCustomerId,
        paymentMethodId: card.stripeCardId,
      });
      if (paymentIntent.status === 'succeeded') {
        // Create charged transaction record
        await this.prisma.chargedTransaction.create({
          data: {
            userId,
            cardId: card.id,
            chargedAmount: totalRoundUp,
            status:
              paymentIntent.status === 'succeeded'
                ? 'CHARGED'
                : paymentIntent.status === 'requires_payment_method'
                  ? 'FAILED'
                  : 'PENDING',
            stripePaymentIntentId: paymentIntent.id,
            failureReason:
              paymentIntent.status === 'succeeded'
                ? null
                : paymentIntent.last_payment_error?.message ||
                  'Unknown failure',
          },
          include: { card: true },
        });
        if (paymentIntent.status !== 'succeeded') {
          this.logger.warn(
            `⚠️ Payment failed for user ${userId}: ${paymentIntent.last_payment_error?.message}`,
          );

          return; // stop further round-up processing for this cycle
        }

        for (const { tx, roundUpAmount } of allRoundUps) {
          if (remainingLimit <= 0) break; // Stop once we hit limit

          const existingRoundUp =
            await this.prisma.roundUpTransaction.findFirst({
              where: {
                plaidTransaction: {
                  transactionId: tx.transaction_id,
                },
              },
            });

          // If it's already been charged (INVESTED or SUCCEEDED), skip it
          if (
            existingRoundUp &&
            ['INVESTED', 'SUCCEEDED', 'FAILED'].includes(existingRoundUp.status)
          ) {
            this.logger.log(
              `⏭️ Skipping already processed transaction ${tx.transaction_id}`,
            );
            continue;
          }

          const account = await this.prisma.plaidAccount.findUnique({
            where: { accountId: tx.account_id },
            include: { plaidItem: true },
          });
          if (!account) continue;

          // Save PlaidTransaction
          const plaidTx = await this.prisma.plaidTransaction.upsert({
            where: { transactionId: tx.transaction_id },
            update: {
              name: tx.name,
              amount: tx.amount,
              date: new Date(tx.date),
              category: tx.category?.join(', ') || null,
            },
            create: {
              plaidAccountId: account.id,
              transactionId: tx.transaction_id,
              name: tx.name,
              amount: tx.amount,
              date: new Date(tx.date),
              category: tx.category?.join(', ') || null,
            },
          });

          const amount = Number(tx.amount);
          const detectedAmount = amount + roundUpAmount;

          // Adjust for remaining limit
          const allowedRoundUp = Math.min(roundUpAmount, remainingLimit);
          remainingLimit -= allowedRoundUp;

          // PaymentIntent returned — inspect status

          await this.prisma.roundUpTransaction.upsert({
            where: { plaidTransactionId: plaidTx.id },
            update: {
              roundUpAmount: allowedRoundUp,
              detectedAmount,
              status: 'INVESTED',
              stripePaymentIntentId: paymentIntent.id,
              failureReason: null,
            },
            create: {
              userId,
              plaidTransactionId: plaidTx.id,
              roundUpAmount: allowedRoundUp,
              detectedAmount,
              status: 'INVESTED',
              stripePaymentIntentId: paymentIntent.id,
              failureReason: null,
            },
          });

          this.logger.log(
            `💸 Charged $${detectedAmount.toFixed(2)} (PI ${paymentIntent.id})`,
          );
        }
      }
    } catch (error) {
      await this.prisma.chargedTransaction.create({
        data: {
          userId,
          cardId: card.id,
          chargedAmount: totalRoundUp,
          status: 'FAILED',
          stripePaymentIntentId: null,
          failureReason: error.message || 'Stripe API failure',
        },
      });
      this.logger.error(
        `❌ Error processing user ${user.id}: ${error.message}`,
        error.stack,
      );
    }
  }
  private getStartDateByFrequency(frequency: string): Date {
    const now = new Date();
    const start = new Date(now);

    switch (frequency) {
      case 'DAILY':
        start.setHours(0, 0, 0, 0);
        break;
      case 'WEEKLY':
        const day = now.getDay(); // 0=Sun .. 6=Sat
        start.setDate(now.getDate() - day); // start of this week (Sunday)
        start.setHours(0, 0, 0, 0);
        break;
      case 'MONTHLY':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      default:
        start.setHours(0, 0, 0, 0);
    }

    return start;
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
}
