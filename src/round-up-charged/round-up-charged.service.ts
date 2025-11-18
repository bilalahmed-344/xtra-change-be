import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RoundUpChargedService {
  private readonly logger = new Logger(RoundUpChargedService.name);

  constructor(
    @InjectQueue('roundup-charge') private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async addChargeJob(userId: string) {
    this.logger.log(`Adding charge job to queue for user ${userId}`);
    await this.queue.add('charge-user', { userId });
  }

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
            select: { id: true, firstName: true, lastName: true, email: true },
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
