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
}
