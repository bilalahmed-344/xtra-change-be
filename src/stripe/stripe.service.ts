import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!stripeSecretKey) {
      throw new InternalServerErrorException(
        'STRIPE_SECRET_KEY is not defined in environment variables',
      );
    }
    this.stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2025-08-27.basil' as any,
    });
  }

  // Get or create Stripe customer
  async getOrCreateCustomer(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await this.stripe.customers.create({
      email: user.email ?? undefined,
      name: user.name ?? undefined,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async addCard(userId: string, paymentMethodId: string) {
    const customerId = await this.getOrCreateCustomer(userId);

    // Attach payment method to customer
    await this.stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Get card details
    const paymentMethod =
      await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.type !== 'card' || !paymentMethod.card) {
      throw new BadRequestException('Provided payment method is not a card');
    }

    // Before creating the new card, reset all others to isDefault = false

    await this.prisma.card.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    // Save to database
    const savedCard = await this.prisma.card.create({
      data: {
        userId,
        stripeCardId: paymentMethodId,
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year,
        status: 'ACTIVE', // always active
        isDefault: true, // always default
      },
    });

    return savedCard;
  }

  async detachCard(paymentMethodId: string) {
    try {
      return await this.stripe.paymentMethods.detach(paymentMethodId);
    } catch (error) {
      throw new BadRequestException('Failed to remove card from Stripe');
    }
  }
  async chargeCard({
    customerId,
    cardId,
    amount,
  }: {
    customerId: string;
    cardId: string;
    amount: number; // in cents
  }) {
    return this.stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      payment_method: cardId,
      off_session: true,
      confirm: true,
    });
  }

  async getOrCreateConnectAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    if (user.stripeConnectId) {
      return user.stripeConnectId;
    }

    const account = await this.stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: user.email ?? undefined,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeConnectId: account.id },
    });

    return account.id;
  }

  async addExternalBankAccount(
    connectAccountId: string,
    {
      name,
      routingNumber,
      accountNumber,
    }: { name: string; routingNumber: string; accountNumber: string },
  ) {
    return this.stripe.accounts.createExternalAccount(connectAccountId, {
      external_account: {
        object: 'bank_account',
        country: 'US',
        currency: 'usd',
        routing_number: routingNumber,
        account_number: accountNumber,
        account_holder_name: name,
      },
    });
  }

  async createPayout(connectAccountId: string, amount: number) {
    return this.stripe.payouts.create(
      {
        amount: Math.round(amount * 100), // convert to cents
        currency: 'usd',
      },
      { stripeAccount: connectAccountId },
    );
  }
}
