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
  //   @Cron(CronExpression.EVERY_MINUTE)

  @Cron(CronExpression.EVERY_6_HOURS)
  async syncAllUserTransactions() {
    this.logger.log('🔄 Starting Plaid transactions sync job...');

    try {
      const users = await this.prisma.user.findMany({
        where: {
          roundUpSetting: {
            enabled: true,
          },
        },
        include: {
          plaidItems: true,
          roundUpSetting: true,
          cards: { where: { isDefault: true } },
        },
      });

      this.logger.log(`Found ${users.length} users with enabled round-ups`);

      for (const user of users) {
        await this.processUserTransactions(user);
      }

      this.logger.log('✅ Finished Plaid transactions sync job.');
    } catch (error) {
      this.logger.error('❌ Critical error in sync job', error.stack);
      throw error;
    }
  }

  // @Cron(CronExpression.EVERY_6_HOURS)
  // async syncAllUserTransactions() {
  //   this.logger.log('🔄 Starting Plaid transactions sync job...');
  //   const users = await this.prisma.user.findMany({
  //     include: {
  //       plaidItems: true,
  //       roundUpSetting: true,
  //       cards: { where: { isDefault: true } },
  //     },
  //   });

  //   for (const user of users) {
  //     const defaultCard = user.cards[0];
  //     if (!defaultCard) {
  //       this.logger.warn(`⚠️ User ${user.id} has no default card, skipping.`);
  //       continue;
  //     }

  //     for (const item of user.plaidItems) {
  //       try {
  //         const accessToken = decrypt(item.accessToken);
  //         await this.syncTransactionsForItem(user, accessToken, defaultCard);
  //       } catch (err) {
  //         this.logger.error(
  //           `❌ Failed to sync transactions for ${user.id}`,
  //           err,
  //         );
  //       }
  //     }
  //   }

  //   this.logger.log('✅ Finished Plaid transactions sync job.');
  // }

  private async processUserTransactions(user: any) {
    const defaultCard = user.cards[0];
    if (!defaultCard) {
      this.logger.warn(`⚠️ User ${user.id} has no default card, skipping.`);
      return;
    }

    const roundUpSetting = user.roundUpSetting;
    if (!roundUpSetting || !roundUpSetting.enabled) {
      return;
    }

    // Check if it's time to run based on frequency
    const now = new Date();
    // if (roundUpSetting.nextRunAt && now < roundUpSetting.nextRunAt) {
    //   this.logger.debug(
    //     `Not yet time for user ${user.id}. Next run: ${roundUpSetting.nextRunAt}`,
    //   );
    //   return;
    // }

    for (const item of user.plaidItems) {
      try {
        const accessToken = decrypt(item.accessToken);
        await this.syncTransactionsForItem(
          user,
          accessToken,
          defaultCard,
          roundUpSetting,
        );
      } catch (err) {
        this.logger.error(
          `❌ Failed to sync transactions for user ${user.id}, item ${item.id}`,
          err.stack,
        );
      }
    }
  }

  private async syncTransactionsForItem(
    user: any,
    accessToken: string,
    card: any,
    roundUpSetting: any,
  ) {
    const { id: userId } = user;
    const now = new Date();

    const startDateObj = this.getStartDateByFrequency(
      roundUpSetting.paymentFrequency,
    );
    const endDateObj = new Date();

    const existingChargeForPeriod =
      await this.prisma.chargedTransaction.findFirst({
        where: {
          userId,
          createdAt: {
            gte: startDateObj,
            lte: endDateObj,
          },
        },
      });

    if (existingChargeForPeriod) {
      this.logger.log(
        `⏭️ User ${userId} already charged between ${startDateObj.toISOString()} and ${endDateObj.toISOString()}. Skipping duplicate charge.`,
      );
      return;
    }

    // testing code

    const endDate = new Date().toISOString().split('T')[0];
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    const startDate = start.toISOString().split('T')[0];

    // Calculate date range for transactions main code
    // const endDate = new Date().toISOString().split('T')[0];
    // const startDate = this.getTransactionStartDate(roundUpSetting).toISOString().split('T')[0];

    const request: TransactionsGetRequest = {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
    };

    let response;
    try {
      response = await this.plaidClient.transactionsGet(request);
    } catch (error) {
      this.logger.error(
        `Failed to fetch Plaid transactions for user ${userId}`,
        error,
      );
      throw error;
    }
    const transactions = response.data.transactions || [];

    // Calculate roundups

    const allRoundUps: { tx: any; roundUpAmount: number }[] = [];

    for (const tx of transactions) {
      // Skip negative amounts (credits) and whole dollar amounts
      if (tx.amount <= 0 || Number.isInteger(tx.amount)) continue;

      const roundUpCents = calculateRoundUp(toCents(tx.amount));
      const roundUpAmount = roundUpCents / 100;
      if (roundUpAmount > 0) {
        allRoundUps.push({ tx, roundUpAmount });
      }
    }

    if (allRoundUps.length === 0) {
      this.logger.log(`No roundups found for user ${userId}`);
      return;
    }
    // Calculate total with limit

    const roundUpLimit = roundUpSetting.roundUpLimit ?? Infinity;
    let totalRoundUp = allRoundUps.reduce((sum, r) => sum + r.roundUpAmount, 0);

    let remainingLimit = roundUpLimit;
    // Apply limit
    totalRoundUp = Math.min(totalRoundUp, roundUpLimit);

    if (totalRoundUp <= 0) return;

    this.logger.log(
      `Processing ${allRoundUps.length} transactions with total roundup $${totalRoundUp.toFixed(2)} for user ${userId}`,
    );

    // Process payment and save records in a transaction
    await this.processPaymentAndSaveRecords(
      user,
      card,
      allRoundUps,
      totalRoundUp,
      roundUpLimit,
      roundUpSetting,
      now,
    );

    // try {
    //   const paymentIntent = await this.stripeService.createPaymentIntent({
    //     amount: Math.round(totalRoundUp * 100),
    //     customerId: user.stripeCustomerId,
    //     paymentMethodId: card.stripeCardId,
    //   });
    //   if (paymentIntent.status === 'succeeded') {
    //     // Create charged transaction record

    //     const chargeStatus =
    //       paymentIntent.status === 'succeeded'
    //         ? 'CHARGED'
    //         : paymentIntent.status === 'requires_payment_method'
    //           ? 'FAILED'
    //           : 'PENDING';

    //     await this.prisma.chargedTransaction.create({
    //       data: {
    //         userId,
    //         cardId: card.id,
    //         chargedAmount: totalRoundUp,
    //         status: chargeStatus,
    //         stripePaymentIntentId: paymentIntent.id,
    //         failureReason:
    //           paymentIntent.status === 'succeeded'
    //             ? null
    //             : paymentIntent.last_payment_error?.message ||
    //               'Unknown failure',
    //       },
    //       include: { card: true },
    //     });

    //     if (paymentIntent.status !== 'succeeded') {
    //       this.logger.warn(
    //         `⚠️ Payment failed for user ${userId}: ${paymentIntent.last_payment_error?.message}`,
    //       );

    //       return;
    //     }

    //     for (const { tx, roundUpAmount } of allRoundUps) {
    //       if (remainingLimit <= 0) break; // Stop once we hit limit

    //       const existingRoundUp =
    //         await this.prisma.roundUpTransaction.findFirst({
    //           where: {
    //             plaidTransaction: {
    //               transactionId: tx.transaction_id,
    //             },
    //           },
    //         });

    //       // If it's already been charged (INVESTED or SUCCEEDED), skip it
    //       if (
    //         existingRoundUp &&
    //         ['INVESTED', 'SUCCEEDED', 'FAILED'].includes(existingRoundUp.status)
    //       ) {
    //         this.logger.log(
    //           `⏭️ Skipping already processed transaction ${tx.transaction_id}`,
    //         );
    //         continue;
    //       }

    //       const account = await this.prisma.plaidAccount.findUnique({
    //         where: { accountId: tx.account_id },
    //         include: { plaidItem: true },
    //       });
    //       if (!account) continue;

    //       // Save PlaidTransaction
    //       const plaidTx = await this.prisma.plaidTransaction.upsert({
    //         where: { transactionId: tx.transaction_id },
    //         update: {
    //           name: tx.name,
    //           amount: tx.amount,
    //           date: new Date(tx.date),
    //           category: tx.category?.join(', ') || null,
    //         },
    //         create: {
    //           plaidAccountId: account.id,
    //           transactionId: tx.transaction_id,
    //           name: tx.name,
    //           amount: tx.amount,
    //           date: new Date(tx.date),
    //           category: tx.category?.join(', ') || null,
    //         },
    //       });

    //       const amount = Number(tx.amount);
    //       const detectedAmount = amount + roundUpAmount;

    //       // Adjust for remaining limit
    //       const allowedRoundUp = Math.min(roundUpAmount, remainingLimit);
    //       remainingLimit -= allowedRoundUp;

    //       // PaymentIntent returned — inspect status

    //       await this.prisma.roundUpTransaction.upsert({
    //         where: { plaidTransactionId: plaidTx.id },
    //         update: {
    //           roundUpAmount: allowedRoundUp,
    //           detectedAmount,
    //           status: 'INVESTED',
    //           stripePaymentIntentId: paymentIntent.id,
    //           failureReason: null,
    //         },
    //         create: {
    //           userId,
    //           plaidTransactionId: plaidTx.id,
    //           roundUpAmount: allowedRoundUp,
    //           detectedAmount,
    //           status: 'INVESTED',
    //           stripePaymentIntentId: paymentIntent.id,
    //           failureReason: null,
    //         },
    //       });

    //       this.logger.log(
    //         `💸 Charged $${detectedAmount.toFixed(2)} (PI ${paymentIntent.id})`,
    //       );
    //     }
    //   }
    // } catch (error) {
    //   await this.prisma.chargedTransaction.create({
    //     data: {
    //       userId,
    //       cardId: card.id,
    //       chargedAmount: totalRoundUp,
    //       status: 'FAILED',
    //       stripePaymentIntentId: null,
    //       failureReason: error.message || 'Stripe API failure',
    //     },
    //   });
    //   this.logger.error(
    //     `❌ Error processing user ${user.id}: ${error.message}`,
    //     error.stack,
    //   );
    // }
  }

  private async processPaymentAndSaveRecords(
    user: any,
    card: any,
    allRoundUps: { tx: any; roundUpAmount: number }[],
    totalRoundUp: number,
    roundUpLimit: number,
    roundUpSetting: any,
    now: Date,
  ) {
    const userId = user.id;

    try {
      // Create payment intent
      const paymentIntent = await this.stripeService.createPaymentIntent({
        amount: Math.round(totalRoundUp * 100),
        customerId: user.stripeCustomerId,
        paymentMethodId: card.stripeCardId,
      });

      const chargeStatus = this.mapPaymentIntentStatusToChargeStatus(
        paymentIntent.status,
      );
      const isSuccessful = paymentIntent.status === 'succeeded';

      // Use database transaction for atomicity
      await this.prisma.$transaction(async (tx) => {
        // Create charged transaction record
        await tx.chargedTransaction.create({
          data: {
            userId,
            cardId: card.id,
            chargedAmount: totalRoundUp,
            status: chargeStatus,
            stripePaymentIntentId: paymentIntent.id,
            failureReason: isSuccessful
              ? null
              : paymentIntent.last_payment_error?.message || 'Unknown failure',
          },
        });

        if (!isSuccessful) {
          this.logger.warn(
            `⚠️ Payment failed for user ${userId}: ${paymentIntent.last_payment_error?.message}`,
          );
          return;
        }

        // Process individual transactions
        let remainingLimit = roundUpLimit;

        for (const { tx: plaidTx, roundUpAmount } of allRoundUps) {
          if (remainingLimit <= 0) break;

          try {
            await this.processIndividualTransaction(
              tx, // Pass the transaction client
              plaidTx,
              userId,
              roundUpAmount,
              remainingLimit,
              paymentIntent.id,
            );

            remainingLimit -= Math.min(roundUpAmount, remainingLimit);
          } catch (error) {
            this.logger.error(
              `Failed to process transaction ${plaidTx.transaction_id}`,
              error,
            );
            // Continue with other transactions
          }
        }

        // Update round-up settings
        const nextRunAt = this.getNextRunDateByFrequency(
          roundUpSetting.paymentFrequency,
          now,
        );

        await tx.roundUpSetting.update({
          where: { userId },
          data: {
            lastRunAt: now,
            nextRunAt,
          },
        });
      });

      this.logger.log(
        `✅ Successfully processed $${totalRoundUp.toFixed(2)} for user ${userId}`,
      );
    } catch (error) {
      // Create failed charge record
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
        `❌ Error processing payment for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async processIndividualTransaction(
    tx: any,
    plaidTx: any,
    userId: string,
    roundUpAmount: number,
    remainingLimit: number,
    paymentIntentId: string,
  ) {
    // Check if already processed
    const existingRoundUp = await tx.roundUpTransaction.findFirst({
      where: {
        plaidTransaction: {
          transactionId: plaidTx.transaction_id,
        },
      },
    });

    if (
      existingRoundUp &&
      ['INVESTED', 'SUCCEEDED'].includes(existingRoundUp.status)
    ) {
      this.logger.debug(
        `⏭️ Skipping already processed transaction ${tx.transaction_id}`,
      );
      return;
    }

    // Find or get account
    const account = await tx.prisma.plaidAccount.findUnique({
      where: { accountId: plaidTx.account_id },
      include: { plaidItem: true },
    });

    if (!account) {
      this.logger.warn(
        `Account ${tx.account_id} not found for transaction ${tx.transaction_id}`,
      );
      return;
    }

    // Upsert Plaid transaction
    const savedPlaidTx = await tx.plaidTransaction.upsert({
      where: { transactionId: plaidTx.transaction_id },
      update: {
        name: plaidTx.name,
        amount: plaidTx.amount,
        date: new Date(plaidTx.date),
        category: plaidTx.category?.join(', ') || null,
      },
      create: {
        plaidAccountId: account.id,
        transactionId: plaidTx.transaction_id,
        name: plaidTx.name,
        amount: plaidTx.amount,
        date: new Date(plaidTx.date),
        category: plaidTx.category?.join(', ') || null,
      },
    });

    const amount = Number(plaidTx.amount);
    const detectedAmount = amount + roundUpAmount;
    const allowedRoundUp = Math.min(roundUpAmount, remainingLimit);
    // Create/update round-up transaction
    await tx.roundUpTransaction.upsert({
      where: { plaidTransactionId: savedPlaidTx.id },
      update: {
        roundUpAmount: allowedRoundUp,
        detectedAmount,
        status: 'INVESTED',
        stripePaymentIntentId: paymentIntentId,
        failureReason: null,
      },
      create: {
        userId,
        plaidTransactionId: savedPlaidTx.id,
        roundUpAmount: allowedRoundUp,
        detectedAmount,
        status: 'INVESTED',
        stripePaymentIntentId: paymentIntentId,
        failureReason: null,
      },
    });
  }

  private mapPaymentIntentStatusToChargeStatus(status: string): string {
    switch (status) {
      case 'succeeded':
        return 'SUCCESS';
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return 'PENDING';
      case 'canceled':
      case 'failed':
        return 'FAILED';
      default:
        return 'PENDING';
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

  private getTransactionStartDate(roundUpSetting: any): Date {
    // If we have a last run date, start from there
    if (roundUpSetting.lastRunAt) {
      return roundUpSetting.lastRunAt;
    }

    // Otherwise, use frequency-based start date
    return this.getStartDateByFrequency(roundUpSetting.paymentFrequency);
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
