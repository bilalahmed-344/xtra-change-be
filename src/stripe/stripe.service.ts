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
      name: `${user.firstName} ${user.lastName}`,
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

    // Always explicitly attach the card
    try {
      await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    } catch (err) {
      if (err.code !== 'resource_already_exists') {
        throw new BadRequestException(`Failed to attach card: ${err.message}`);
      }
    }

    // Set as default payment method
    await this.stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    const paymentMethod =
      await this.stripe.paymentMethods.retrieve(paymentMethodId);

    // Save in DB
    await this.prisma.card.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    return this.prisma.card.create({
      data: {
        userId,
        stripeCardId: paymentMethod.id,
        brand: paymentMethod.card?.brand,
        last4: paymentMethod.card?.last4,
        expMonth: paymentMethod.card?.exp_month
          ? paymentMethod.card.exp_month.toString().padStart(2, '0')
          : null,
        expYear: paymentMethod.card?.exp_year
          ? paymentMethod.card.exp_year.toString()
          : null,
        isDefault: true,
      },
    });
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
      description: 'Round-up investment charge',
    });
  }

  async getOrCreateConnectAccount(userId: string, ipAddress: string, dto: any) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    if (user.stripeConnectId) {
      // Check if account is restricted and needs update
      const existingAccount = await this.stripe.accounts.retrieve(
        user.stripeConnectId,
      );
      return existingAccount.id;
    }

    // Prepare account creation params
    const accountParams: Stripe.AccountCreateParams = {
      type: 'custom',
      country: 'US',
      email: user.email ?? 'no-email@example.com',

      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },

      business_type: 'individual',

      individual: {
        first_name: user.firstName ?? 'Test',
        last_name: user.lastName ?? 'User',
        email: user.email ?? 'no-email@example.com',
        phone: user.phoneNumber?.replace(/\s+/g, '') ?? '+10000000000',

        dob: {
          day: 2,
          month: 3,
          year: 1999,
        },

        address: {
          line1: user.address ?? '123 Main Street',
          city: user.city ?? 'New York',
          state: user.state ?? 'NY',
          postal_code: user.postal_code ?? '10001',
          country: user?.country ?? 'US',
        },
        ssn_last_4: '0000',
        id_number: '000000000',
      },

      tos_acceptance: {
        date: Math.floor(Date.now() / 1000),
        ip: ipAddress,
      },

      business_profile: {
        product_description: 'User withdrawals and payments',
        mcc: '5734',
        url: 'https://yourapp.com',
      },

      external_account: {
        object: 'bank_account',
        account_holder_name:
          dto?.account_holder_name ?? `${user.firstName ?? 'Test User'}`,
        // account_holder_type: dto?.account_holder_type ?? 'individual',
        account_holder_type: 'individual',
        routing_number: dto?.routing_number ?? '110000000',
        account_number: dto?.account_number ?? '000123456789',
        country: 'US',
        currency: 'usd',
      },

      metadata: { userId },
    };

    const account = await this.stripe.accounts.create(accountParams);

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeConnectId: account.id },
    });

    // Check if there are still requirements
    // const accountDetails = await this.stripe.accounts.retrieve(account.id);
    // console.log('Account Status:', {
    //   charges_enabled: accountDetails.charges_enabled,
    //   payouts_enabled: accountDetails.payouts_enabled,
    //   requirements: accountDetails.requirements,
    // });

    // if (accountDetails.requirements?.currently_due?.length > 0) {
    //   throw new BadRequestException({
    //     message: 'Additional information required',
    //     requirements: accountDetails.requirements.currently_due,
    //     errors: accountDetails.requirements.errors,
    //   });
    // }

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
    // Only add a new bank account if one doesn’t already exist
    const accounts = await this.stripe.accounts.listExternalAccounts(
      connectAccountId,
      {
        object: 'bank_account',
      },
    );

    if (accounts.data.length > 0) {
      return accounts.data[0]; // return existing test bank account
    }

    return await this.stripe.accounts.createExternalAccount(connectAccountId, {
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
  async retrievePayout(connectAccountId: string, payoutId: string) {
    try {
      return await this.stripe.payouts.retrieve(payoutId, {
        stripeAccount: connectAccountId,
      });
    } catch (error) {
      throw new BadRequestException(
        `Failed to retrieve payout: ${error.message}`,
      );
    }
  }

  async createPaymentIntent({
    amount,
    customerId,
    paymentMethodId,
    returnUrl,
  }: {
    amount: number; // cents
    customerId: string;
    paymentMethodId: string;
    returnUrl?: string; // optional, used if a redirect is needed
  }) {
    // Prefer to create as off_session with automatic_payment_methods disallowing redirects
    // so Stripe won't attempt redirect-based methods in a server-side flow.
    const params: Stripe.PaymentIntentCreateParams = {
      amount,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: 'Round-up investment charge',
      // Try to prevent redirect-based payment methods from being used:
      automatic_payment_methods: {
        enabled: true,
        // @ts-ignore allow_redirects may not be typed in your Stripe version
        allow_redirects: 'never',
      } as any,
    };

    // If you *do* want to allow redirects (e.g. for web flows), provide return_url:
    if (returnUrl) {
      // If you set return_url, Stripe may perform a redirect for SCA flows.
      (params as any).return_url = returnUrl;
    }

    try {
      const pi = await this.stripe.paymentIntents.create(params);
      return pi;
    } catch (err) {
      // bubble up with message for caller to handle and save
      throw err;
    }
  }

  async createTestFunding(connectAccountId: string) {
    return await this.stripe.charges.create({
      amount: 5000, // $50
      currency: 'usd',
      source: 'tok_visa',
      description: 'Test funding for Express account',
      destination: { account: connectAccountId },
    });
  }

  constructEvent(payload: Buffer, sig: string, endpointSecret: string): any {
    return this.stripe.webhooks.constructEvent(payload, sig, endpointSecret);
  }
}
