import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateRoundUpDto } from './dto/create-round-up.dto';

@Injectable()
export class RoundUpService {
  constructor(private prisma: PrismaService) {}

  async createOrUpdate(userId: string, dto: CreateRoundUpDto) {
    try {
      return await this.prisma.roundUpSetting.upsert({
        where: { userId }, // ✅ now valid because userId is unique
        update: { ...dto },
        create: { userId, ...dto },
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
