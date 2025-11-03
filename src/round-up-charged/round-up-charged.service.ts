import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

interface GetAllChargedTransactionsDto {
  userId: string;
  page: number;
  limit: number;
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class RoundUpChargedService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllChargedTransactions({
    userId,
    page,
    limit,
    startDate,
    endDate,
  }: GetAllChargedTransactionsDto) {
    const skip = (page - 1) * limit;

    const where: any = { userId };

    // Optional date filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      this.prisma.chargedTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phoneNumber: true,
            },
          },
          plaidTransaction: {
            select: {
              name: true,
              amount: true,
              date: true,
              category: true,
            },
          },
          card: {
            select: {
              id: true,
              brand: true,
              last4: true,
              expMonth: true,
              expYear: true,
              isDefault: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.chargedTransaction.count({ where }),
    ]);

    return {
      data: transactions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
