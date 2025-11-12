import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentFrequency, RoundUpStatus } from '@prisma/client';
import { PlaidService } from 'src/plaid/plaid.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { decrypt } from 'src/utils/crypto.util';
import { calculateRoundUp, toCents } from 'src/utils/roundup';

@Injectable()
export class RoundUpTransactionService {
  constructor(
    private prisma: PrismaService,
    private plaidService: PlaidService,
  ) {}

  async getTotalSavings(userId: string) {
    const total = await this.prisma.roundUpTransaction.aggregate({
      where: {
        userId,
        status: RoundUpStatus.INVESTED,
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
    if (!roundUpSetting) {
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
        status: RoundUpStatus.PENDING,
      },
    });

    const total = transactions.reduce((sum, tx) => sum + tx.roundUpAmount, 0);

    return {
      frequency: roundUpSetting.paymentFrequency,
      totalSavings: total.toFixed(2),
    };
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

    if (!roundUpSetting) throw new Error('Round-up setting not enabled');
    if (!plaidItems.length) throw new Error('No Plaid accounts found');

    const { paymentFrequency, roundUpLimit } = roundUpSetting;

    // Determine start date based on frequency
    const now = new Date();
    // let startDate: Date;

    // switch (paymentFrequency) {
    //   case PaymentFrequency.DAILY:
    //     startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    //     break;
    //   case PaymentFrequency.WEEKLY:
    //     const day = now.getDay(); // 0 = Sunday
    //     startDate = new Date(now);
    //     startDate.setDate(now.getDate() - day); // Start of week
    //     break;
    //   case PaymentFrequency.MONTHLY:
    //     startDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
    //     break;
    //   default:
    //     startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // }

    // const endDate = now;

    const allRoundUps: any[] = [];

    const endDate = new Date().toISOString().split('T')[0];
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1); // last 1 year
    const startDate = start.toISOString().split('T')[0];

    for (const item of plaidItems) {
      const accessToken = decrypt(item.accessToken);
      const response = await this.plaidService.getTransactionsFromPlaid(
        accessToken,
        startDate,
        endDate,
      );

      const transactions = response?.transactions || [];

      for (const tx of transactions) {
        if (tx.amount <= 0 || Number.isInteger(tx.amount)) continue;

        const roundUpAmount = calculateRoundUp(toCents(tx.amount)) / 100;

        if (roundUpAmount > 0) allRoundUps.push({ tx, roundUpAmount });
      }
    }

    // Limit round-ups according to user setting
    const limit = roundUpLimit ?? allRoundUps.length;
    const limitedRoundUps = allRoundUps.slice(0, limit);

    let savedCount = 0;

    for (const { tx, roundUpAmount } of limitedRoundUps) {
      if (savedCount >= limit) break; // stop if we reached limit

      let existingPlaidTx = await this.prisma.plaidTransaction.findUnique({
        where: { transactionId: tx.transaction_id },
      });

      if (!existingPlaidTx) {
        const account = await this.prisma.plaidAccount.findUnique({
          where: { accountId: tx.account_id },
        });
        if (!account) continue;

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

      const existingRoundUp = await this.prisma.roundUpTransaction.findUnique({
        where: { plaidTransactionId: existingPlaidTx.id },
      });
      if (!existingRoundUp) {
        await this.prisma.roundUpTransaction.create({
          data: {
            userId,
            plaidTransactionId: existingPlaidTx.id,
            roundUpAmount,
            detectedAmount: tx.amount + roundUpAmount,
            status: RoundUpStatus.PENDING,
          },
        });
        savedCount++; // increment after saving
      }
    }

    const transactions = await this.prisma.roundUpTransaction.findMany({
      where: { userId, status: RoundUpStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        plaidTransaction: {
          select: {
            id: true,
            transactionId: true,
            amount: true,
            name: true,
            date: true,
            category: true,
          },
        },
      },
    });

    return transactions;
  }
}
