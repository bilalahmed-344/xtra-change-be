import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RoundUpTransactionService {
  constructor(private prisma: PrismaService) {}

  async getTotalSavings(userId: string) {
    const total = await this.prisma.roundUpTransaction.aggregate({
      where: {
        userId,
        status: { in: ['PENDING', 'INVESTED'] },
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
        status: { in: ['PENDING', 'INVESTED'] },
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
    const skip = (page - 1) * limit;

    const [transactions, totalCount] = await Promise.all([
      this.prisma.roundUpTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
            },
          },
          plaidTransaction: {
            // 👈 include PlaidTransaction relation
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
      }),
      this.prisma.roundUpTransaction.count({ where: { userId } }),
    ]);

    return {
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      transactions,
    };
  }
}
