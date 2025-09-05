import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from 'src/stripe/stripe.service';
import { CreateCardDto } from './dto/create-card.dto';

@Injectable()
export class CardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  async create(userId: string, createCardDto: CreateCardDto) {
    const { paymentMethodId } = createCardDto;
    return this.stripeService.addCard(userId, paymentMethodId);
  }
  async findAll(userId: string) {
    return this.prisma.card.findMany({
      where: { userId },
    });
  }
  async findOne(id: string) {
    const card = await this.prisma.card.findUnique({ where: { id } });
    if (!card) {
      throw new NotFoundException(`Card with ID ${id} not found`);
    }
    return card;
  }

  async remove(id: string) {
    return this.prisma.card.delete({ where: { id } });
  }
}
