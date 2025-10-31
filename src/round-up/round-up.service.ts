import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRoundUpDto } from './dto/create-round-up.dto';

@Injectable()
export class RoundUpService {
  constructor(private prisma: PrismaService) {}

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

  async createOrUpdate(userId: string, dto: CreateRoundUpDto) {
    const now = new Date();
    const nextRunAt = this.getNextRunDateByFrequency(dto.paymentFrequency, now);
    try {
      return await this.prisma.roundUpSetting.upsert({
        where: { userId },
        update: { ...dto, nextRunAt },
        create: { userId, ...dto, nextRunAt },
      });
    } catch (err) {
      console.error('Error in createOrUpdate RoundUp:', err);
      throw new InternalServerErrorException(
        'Could not save Round-Up configuration',
      );
    }
  }

  async findByUser(userId: string) {
    return this.prisma.roundUpSetting.findUnique({
      where: { userId },
    });
  }
}
