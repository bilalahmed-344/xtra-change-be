import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RoundUpChargedService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllChargedTransactions({
    userId,
    page,
    limit,
    startDate,
    endDate,
  }: {
    userId: string;
    page: number;
    limit: number;
    startDate?: string;
    endDate?: string;
  }) {
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.chargedTransaction.findMany({
        where,
        include: {
          card: true,
          user: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.chargedTransaction.count({ where }),
    ]);

    return {
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
