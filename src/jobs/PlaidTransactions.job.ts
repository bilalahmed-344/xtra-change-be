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
import { RoundUpChargedService } from 'src/round-up-charged/round-up-charged.service';
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
    private readonly roundUpChargeService: RoundUpChargedService,
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
            // only users that have a roundUpSetting record
            isNot: null,
          },
        },
        include: {
          plaidItems: true,
          roundUpSetting: true,
        },
      });

      this.logger.log(`Found ${users.length} with enabled round-ups`);

      for (const user of users) {
        await this.processUserTransactions(user);
      }

      this.logger.log('✅ Finished Plaid transactions sync job.');
    } catch (error) {
      this.logger.error('❌ Critical error in sync job', error.stack);
      throw error;
    }
  }

  private async processUserTransactions(user: any) {
    const roundUpSetting = user.roundUpSetting;

    if (!roundUpSetting || !roundUpSetting.roundUpLimit) {
      return;
    }

    // Check if it's time to run based on frequency

    // const now = new Date();

    // if (roundUpSetting.nextRunAt && now < roundUpSetting.nextRunAt) {
    //   this.logger.debug(
    //     `Not yet time for user ${user.id}. Next run: ${roundUpSetting.nextRunAt}`,
    //   );
    //   return;
    // }

    for (const item of user.plaidItems) {
      try {
        // const accessToken = item.accessToken;

        const accessToken = decrypt(item.accessToken);
        if (!accessToken) {
          this.logger.error(
            `❌ Failed to decrypt accessToken for user ${user.id}, item ${item.id}. Skipping this item.`,
          );
          continue;
        }
        await this.syncTransactionsForItem(user, accessToken, roundUpSetting);
      } catch (err) {
        this.logger.error(
          `❌ Failed to sync transactions for user ${user.id}, item ${item.id}`,
          err.stack,
        );
      }
    }
    // AFTER processing all items, check if it's time to charge
    const now = new Date();

    // if (roundUpSetting.nextRunAt && now >= roundUpSetting.nextRunAt) {
    //   this.logger.log(
    //     `⏰ Charging time reached for user ${user.id}. Enqueueing charge job...`,
    //   );

    await this.roundUpChargeService.addChargeJob(user.id);
    // }
  }

  private async syncTransactionsForItem(
    user: any,
    accessToken: string,
    roundUpSetting: any,
  ) {
    const { id: userId } = user;
    const now = new Date();

    const startDateObj = this.getStartDateByFrequency(
      roundUpSetting.paymentFrequency,
    );
    const endDateObj = new Date();

    // const existingChargeForPeriod =
    //   await this.prisma.chargedTransaction.findFirst({
    //     where: {
    //       userId,
    //       status: 'SUCCESS',
    //       createdAt: {
    //         gte: startDateObj,
    //         lte: endDateObj,
    //       },
    //     },
    //   });

    // if (existingChargeForPeriod) {
    //   this.logger.log(
    //     `⏭️ User ${userId} already charged between ${startDateObj.toISOString()} and ${endDateObj.toISOString()}. Skipping duplicate charge.`,
    //   );
    //   return;
    // }

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

    // FIX: Calculate total with proper limit application

    const roundUpLimit = roundUpSetting.roundUpLimit ?? Infinity;
    let totalRoundUp = 0;
    let limitedRoundUps: {
      tx: any;
      roundUpAmount: number;
      allowedAmount: number;
    }[] = [];

    let remainingLimit = roundUpLimit;

    for (const roundUp of allRoundUps) {
      if (remainingLimit <= 0) break;

      const allowedAmount = Math.min(roundUp.roundUpAmount, remainingLimit);
      totalRoundUp += allowedAmount;
      remainingLimit -= allowedAmount;

      limitedRoundUps.push({
        tx: roundUp.tx,
        roundUpAmount: roundUp.roundUpAmount,
        allowedAmount,
      });
    }

    if (totalRoundUp <= 0) return;

    this.logger.log(
      `Processing ${allRoundUps.length} transactions with total roundup $${totalRoundUp.toFixed(2)} for user ${userId}`,
    );

    // Process payment and save records in a transaction

    await this.pendingPaymentAndSaveRecords(
      user,
      limitedRoundUps,
      totalRoundUp,
    );
  }

  private async pendingPaymentAndSaveRecords(
    user: any,
    limitedRoundUps: {
      tx: any;
      roundUpAmount: number;
      allowedAmount: number;
    }[],
    totalRoundUp: number,
  ) {
    const userId = user.id;

    try {
      // Use database transaction for atomicity

      for (const { tx: plaidTx, allowedAmount } of limitedRoundUps) {
        await this.prisma.$transaction(async (prismaClient) => {
          try {
            await this.pendingIndividualTransaction(
              prismaClient,
              plaidTx,
              userId,
              allowedAmount,
            );
          } catch (error) {
            this.logger.error(
              `Failed to process transaction ${plaidTx.transaction_id}`,
              error,
            );
          }
        });
      }

      this.logger.log(
        `✅ Successfully processed $${totalRoundUp.toFixed(2)} for user ${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Error processing payment for user ${userId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async pendingIndividualTransaction(
    prismaClient: any,
    plaidTx: any,
    userId: string,
    allowedRoundUp: number,
  ) {
    // Check if already processed
    const existingRoundUp = await prismaClient.roundUpTransaction.findFirst({
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
        `⏭️ Skipping already processed transaction ${plaidTx.transaction_id}`,
      );
      return;
    }

    // Find or get account
    const account = await prismaClient.plaidAccount.findUnique({
      where: { accountId: plaidTx.account_id },
      include: { plaidItem: true },
    });

    if (!account) {
      this.logger.warn(
        `Account ${plaidTx.account_id} not found for transaction ${plaidTx.transaction_id}`,
      );
      return;
    }

    // Upsert Plaid transaction
    const savedPlaidTx = await prismaClient.plaidTransaction.upsert({
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
    const detectedAmount = amount + allowedRoundUp;
    // Create/update round-up transaction
    await prismaClient.roundUpTransaction.upsert({
      where: { plaidTransactionId: savedPlaidTx.id },
      update: {
        roundUpAmount: allowedRoundUp,
        detectedAmount,
        status: 'PENDING',
        failureReason: null,
      },
      create: {
        userId,
        plaidTransactionId: savedPlaidTx.id,
        roundUpAmount: allowedRoundUp,
        detectedAmount,
        status: 'PENDING',
        failureReason: null,
      },
    });
  }

  private async chagerPaymentAndSaveRecords(
    user: any,
    card: any,
    limitedRoundUps: {
      tx: any;
      roundUpAmount: number;
      allowedAmount: number;
    }[],
    totalRoundUp: number,
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
      await this.prisma.$transaction(async (prismaClient) => {
        // Create charged transaction record
        await prismaClient.chargedTransaction.create({
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

        // Update round-up settings
        const nextRunAt = this.getNextRunDateByFrequency(
          roundUpSetting.paymentFrequency,
          now,
        );

        await prismaClient.roundUpSetting.update({
          where: { userId },
          data: {
            lastRunAt: now,
            nextRunAt,
          },
        });
        this.logger.debug(
          `Updated nextRunAt for user ${userId} to ${nextRunAt.toISOString()}`,
        );

        for (const { tx: plaidTx, allowedAmount } of limitedRoundUps) {
          try {
            await this.processIndividualTransaction(
              prismaClient,
              plaidTx,
              userId,
              allowedAmount,
              paymentIntent.id,
            );
          } catch (error) {
            this.logger.error(
              `Failed to process transaction ${plaidTx.transaction_id}`,
              error,
            );
          }
        }
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
    prismaClient: any,
    plaidTx: any,
    userId: string,
    allowedRoundUp: number,
    paymentIntentId: string,
  ) {
    // Check if already processed
    const existingRoundUp = await prismaClient.roundUpTransaction.findFirst({
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
        `⏭️ Skipping already processed transaction ${plaidTx.transaction_id}`,
      );
      return;
    }

    // Find or get account
    const account = await prismaClient.plaidAccount.findUnique({
      where: { accountId: plaidTx.account_id },
      include: { plaidItem: true },
    });

    if (!account) {
      this.logger.warn(
        `Account ${plaidTx.account_id} not found for transaction ${plaidTx.transaction_id}`,
      );
      return;
    }

    // Upsert Plaid transaction
    const savedPlaidTx = await prismaClient.plaidTransaction.upsert({
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
    const detectedAmount = amount + allowedRoundUp;
    // Create/update round-up transaction
    await prismaClient.roundUpTransaction.upsert({
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
