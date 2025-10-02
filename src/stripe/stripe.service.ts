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

  // async addCard(userId: string, paymentMethodId: string) {
  //   const customerId = await this.getOrCreateCustomer(userId);

  //   // Get card details
  //   const paymentMethod =
  //     await this.stripe.paymentMethods.retrieve(paymentMethodId);

  //   if (paymentMethod.customer && paymentMethod.customer !== customerId) {
  //     throw new BadRequestException(
  //       'This payment method belongs to another customer',
  //     );
  //   }
  //   // Attach payment method to customer

  //   // 2. Attach only if not already attached
  //   if (!paymentMethod.customer) {
  //     await this.stripe.paymentMethods.attach(paymentMethodId, {
  //       customer: customerId,
  //     });
  //   }

  //   // Before creating the new card, reset all others to isDefault = false

  //   await this.prisma.card.updateMany({
  //     where: { userId },
  //     data: { isDefault: false },
  //   });

  //   // Save to database
  //   const savedCard = await this.prisma.card.create({
  //     data: {
  //       userId,
  //       stripeCardId: paymentMethodId,
  //       brand: paymentMethod?.card?.brand,
  //       last4: paymentMethod?.card?.last4,
  //       expMonth: paymentMethod?.card?.exp_month,
  //       expYear: paymentMethod?.card?.exp_year,
  //       status: 'ACTIVE', // always active
  //       isDefault: true, // always default
  //     },
  //   });

  //   return savedCard;
  // }
  async addCard(userId: string, paymentMethodId: string) {
    const customerId = await this.getOrCreateCustomer(userId);

    // Fetch the payment method (it should already be attached by SetupIntent)
    const paymentMethod =
      await this.stripe.paymentMethods.retrieve(paymentMethodId);

    // Check if the card actually belongs to this customer
    if (!paymentMethod.customer || paymentMethod.customer !== customerId) {
      throw new BadRequestException(
        'This card is not linked to the current customer',
      );
    }

    // Mark all other cards as non-default
    await this.prisma.card.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    // Save card in DB
    const savedCard = await this.prisma.card.create({
      data: {
        userId,
        stripeCardId: paymentMethod.id,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month,
        expYear: paymentMethod.card?.exp_year,
        status: 'ACTIVE',
        isDefault: true,
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
  async createStripeSetupIntent(userId: string) {
    const customerId = await this.getOrCreateCustomer(userId);

    return this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }
}
