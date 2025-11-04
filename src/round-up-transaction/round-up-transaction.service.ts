import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PlaidApi, TransactionsGetRequest } from 'plaid';
import { PlaidService } from 'src/plaid/plaid.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { decrypt } from 'src/utils/crypto.util';
import { calculateRoundUp, toCents } from 'src/utils/roundup';

@Injectable()
export class RoundUpTransactionService {
  private readonly logger = new Logger(RoundUpTransactionService.name);
  constructor(
    private prisma: PrismaService,
    private plaidService: PlaidService,
  ) {}

  async getTotalSavings(userId: string) {
    const total = await this.prisma.roundUpTransaction.aggregate({
      where: {
        userId,
        status: 'INVESTED',
      },
      _sum: {
        roundUpAmount: true,
      },
    });

    return {
      totalSavings: total._sum.roundUpAmount || 0,
    };
  }

  async getSavingsByFrequency(userId: string) {
    const roundUpSetting = await this.prisma.roundUpSetting.findUnique({
      where: { userId },
    });
    if (!roundUpSetting || !roundUpSetting.enabled) {
      throw new BadRequestException('RoundUpSetting not found for user');
    }

    const now = new Date();
    const start = new Date();

    switch (roundUpSetting.paymentFrequency) {
      case 'DAILY':
        start.setDate(now.getDate() - 1);
        break;
      case 'WEEKLY':
        start.setDate(now.getDate() - 7);
        break;
      case 'MONTHLY':
        start.setMonth(now.getMonth() - 1);
        break;
    }

    const transactions = await this.prisma.roundUpTransaction.findMany({
      where: {
        userId,
        createdAt: {
          gte: start,
          lte: now,
        },
        status: 'PENDING',
      },
    });

    const total = transactions.reduce((sum, tx) => sum + tx.roundUpAmount, 0);

    return {
      frequency: roundUpSetting.paymentFrequency,
      totalSavings: total,
      //   transactions,
    };
  }

  async getAllTransactions(userId: string, page: number, limit: number) {
    const roundUpSetting = await this.prisma.roundUpSetting.findUnique({
      where: { userId },
    });

    return roundUpSetting;

    // const skip = (page - 1) * limit;

    // const where: any = { userId };

    // if (status) {
    //   where.status = status;
    // }

    // if (startDate && endDate) {
    //   where.createdAt = {
    //     gte: new Date(startDate),
    //     lte: new Date(endDate),
    //   };
    // }

    // const [transactions, totalCount] = await Promise.all([
    //   this.prisma.roundUpTransaction.findMany({
    //     where,
    //     orderBy: { createdAt: 'desc' },
    //     skip,
    //     take: limit,
    //     include: {
    //       user: {
    //         select: {
    //           id: true,
    //           name: true,
    //           phoneNumber: true,
    //         },
    //       },
    //       plaidTransaction: {
    //         select: {
    //           id: true,
    //           transactionId: true,
    //           amount: true,
    //           name: true,
    //           date: true,
    //           category: true,
    //         },
    //       },
    //     },
    //   }),
    //   this.prisma.roundUpTransaction.count({ where: { userId } }),
    // ]);

    // return {
    //   page,
    //   limit,
    //   totalPages: Math.ceil(totalCount / limit),
    //   totalCount,
    //   transactions,
    // };
  }

  async syncPlaidTransactions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        plaidItems: true,
        roundUpSetting: true,
      },
    });

    if (!user) throw new Error('User not found');
    const { plaidItems, roundUpSetting } = user;

    if (!roundUpSetting || !roundUpSetting.enabled)
      throw new Error('Round-up setting not enabled');
    if (!plaidItems.length) throw new Error('No Plaid accounts found');

    for (const item of plaidItems) {
      const accessToken = decrypt(item.accessToken);
      return await this.fetchAndSaveTransactions(userId, accessToken);
    }
  }

  private async fetchAndSaveTransactions(userId: string, accessToken: string) {
    const decryptedToken = accessToken;
    const endDate = new Date().toISOString().split('T')[0];
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1); // last 1 year
    const startDate = start.toISOString().split('T')[0];

    // Get transactions from Plaid
    const response = await this.plaidService.getTransactionsFromPlaid(
      decryptedToken,
      startDate,
      endDate,
    );
    const transactions = response?.transactions || [];
    // Filter transactions and calculate round-ups
    const allRoundUps: { tx: any; roundUpAmount: number }[] = [];
    for (const tx of transactions) {
      if (tx.amount <= 0 || Number.isInteger(tx.amount)) continue;

      const roundUpCents = calculateRoundUp(toCents(tx.amount));
      const roundUpAmount = roundUpCents / 100;
      if (roundUpAmount > 0) allRoundUps.push({ tx, roundUpAmount });
    }

    // Save transactions in DB
    for (const { tx, roundUpAmount } of allRoundUps) {
      let existingPlaidTx = await this.prisma.plaidTransaction.findUnique({
        where: { transactionId: tx.transaction_id },
      });
      if (!existingPlaidTx) {
        const account = await this.prisma.plaidAccount.findUnique({
          where: { accountId: tx.account_id },
        });
        if (!account) continue;

        // Save PlaidTransaction
        existingPlaidTx = await this.prisma.plaidTransaction.create({
          data: {
            plaidAccountId: account.id,
            transactionId: tx.transaction_id,
            name: tx.name,
            amount: tx.amount,
            date: new Date(tx.date),
            category: tx.category?.join(', ') || null,
          },
        });
      }

      // Check if roundUpTransaction already exists
      const existingRoundUp = await this.prisma.roundUpTransaction.findUnique({
        where: { plaidTransactionId: existingPlaidTx.id },
      });
      if (existingRoundUp) continue;

      await this.prisma.roundUpTransaction.create({
        data: {
          userId,
          plaidTransactionId: existingPlaidTx.id,
          roundUpAmount,
          detectedAmount: tx.amount + roundUpAmount,
          status: 'PENDING',
        },
      });
    }
  }
}
