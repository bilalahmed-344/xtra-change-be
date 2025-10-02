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

  async remove(userId: string, cardId: string) {
    const card = await this.prisma.card.findUnique({ where: { id: cardId } });
    if (!card || card.userId !== userId) {
      throw new NotFoundException('Card not found for this user');
    }

    try {
      await this.stripeService.detachCard(card.stripeCardId);
    } catch (error) {
      console.error('Error detaching card from Stripe:', error);
    }

    await this.prisma.card.delete({ where: { id: cardId } });

    return {
      success: true,
      message: 'Card has been successfully removed',
    };
  }

  async setActiveCard(userId: string, cardId: string) {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
    });

    if (!card || card.userId !== userId) {
      throw new NotFoundException('Card not found for this user');
    }

    // Reset all other cards
    await this.prisma.card.updateMany({
      where: { userId },
      data: { isDefault: false, status: 'INACTIVE' },
    });

    // Mark selected card as ACTIVE + default
    return this.prisma.card.update({
      where: { id: cardId },
      data: { isDefault: true, status: 'ACTIVE' },
    });
  }

  async createSetupIntent(userId: string) {
    return this.stripeService.createStripeSetupIntent(userId);
  }
}
