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
import { decrypt } from 'src/utils/crypto.util';
import { calculateRoundUp, toCents } from 'src/utils/roundup';

@Injectable()
export class PlaidTransactionsJob {
  private readonly logger = new Logger(PlaidTransactionsJob.name);
  private plaidClient: PlaidApi;

  constructor(
    private readonly prisma: PrismaService,
    private configService: ConfigService,
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
    this.logger.log('🚀 PlaidService initialized');
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
      include: { plaidItems: true },
    });

    for (const user of users) {
      for (const item of user.plaidItems) {
        try {
          const accessToken = decrypt(item.accessToken);
          await this.syncTransactionsForItem(user.id, accessToken);
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

  //   private async syncTransactionsForItem(userId: string, accessToken: string) {
  //     const today = new Date();
  //     const endDate = today.toISOString().split('T')[0];
  //     const start = new Date();
  //     start.setDate(start.getDate() - 30);
  //     const startDate = start.toISOString().split('T')[0];

  //     const request: TransactionsGetRequest = {
  //       access_token: accessToken,
  //       start_date: startDate,
  //       end_date: endDate,
  //     };

  //     const response = await this.plaidClient.transactionsGet(request);
  //     const transactions = response.data.transactions || [];

  //     for (const tx of transactions) {
  //       //  Only store DEBIT (money leaving account)
  //       //  Only amounts with cents (e.g. 10.75, not 10.00)
  //       if (tx.amount <= 0 || Number.isInteger(tx.amount)) continue;

  //       const account = await this.prisma.plaidAccount.findUnique({
  //         where: { accountId: tx.account_id },
  //         include: { plaidItem: true },
  //       });
  //       if (!account) continue;

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

  //       // Calculate RoundUp
  //       const roundUpCents = calculateRoundUp(toCents(tx.amount));
  //       const roundUpAmount = roundUpCents / 100;
  //       if (roundUpAmount > 0) {
  //         // Save RoundUpTransaction (skip if already exists)
  //         await this.prisma.roundUpTransaction.upsert({
  //           where: { plaidTransactionId: plaidTx.id },
  //           update: { roundUpAmount },
  //           create: {
  //             userId: account.plaidItem.userId,
  //             plaidTransactionId: plaidTx.id,
  //             roundUpAmount,
  //           },
  //         });
  //         this.logger.log(
  //           `💰 Roundup added for ${tx.name} — $${roundUpAmount.toFixed(2)}`,
  //         );
  //       }
  //     }
  //   }

  private async syncTransactionsForItem(userId: string, accessToken: string) {
    const roundUpSetting = await this.prisma.roundUpSetting.findUnique({
      where: { userId },
    });

    if (!roundUpSetting || !roundUpSetting.enabled) return;

    const startDateObj = this.getStartDateByFrequency(
      roundUpSetting.paymentFrequency,
    );
    const endDateObj = new Date();

    const startDate = startDateObj.toISOString().split('T')[0];
    const endDate = endDateObj.toISOString().split('T')[0];

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
    this.logger.log(
      `🧮 User ${userId} total roundups = $${totalRoundUp.toFixed(2)}, limit = $${roundUpLimit}`,
    );

    for (const { tx, roundUpAmount } of allRoundUps) {
      if (remainingLimit <= 0) break; // Stop once we hit limit

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

      // Adjust for remaining limit
      const allowedRoundUp = Math.min(roundUpAmount, remainingLimit);
      remainingLimit -= allowedRoundUp;

      await this.prisma.roundUpTransaction.upsert({
        where: { plaidTransactionId: plaidTx.id },
        update: { roundUpAmount: allowedRoundUp },
        create: {
          userId: account.plaidItem.userId,
          plaidTransactionId: plaidTx.id,
          roundUpAmount: allowedRoundUp,
        },
      });

      this.logger.log(
        `💰 Added roundup $${allowedRoundUp.toFixed(2)} (remaining limit: $${remainingLimit.toFixed(2)})`,
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
}
