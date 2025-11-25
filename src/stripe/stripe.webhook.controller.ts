// src/stripe/stripe-webhook.controller.ts
import { Controller, Post, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { Public } from 'src/auth/auth.guard';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    @InjectQueue('withdrawal-queue') private readonly withdrawalQueue: Queue,
  ) {
    this.logger.log('✅ StripeWebhookController initialized');
  }

  @Public()
  @Post('webhook')
  async handleStripeWebhook(@Req() req: Request, @Res() res: Response) {
    const sig = req.headers['stripe-signature'] as string;

    this.logger.log(`req.body`, req.body);

    // const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // const endpointSecret = 'whsec_ZqUiSDK0OI26OSoj5od911c87hoeUxS9';
    const endpointSecret = 'whsec_FZy1jz7ZGx8SdWC6PklxPCSemhCzxGgR';
    let event: Stripe.Event;

    if (!endpointSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not defined in environment variables',
      );
    }

    try {
      // Use rawBody for signature verification
      event = this.stripeService.constructEvent(
        (req as any).rawBody,
        sig,
        endpointSecret,
      );
    } catch (err) {
      this.logger.error(
        `Webhook signature verification failed: ${err.message}`,
      );
      return res
        .status(HttpStatus.BAD_REQUEST)
        .send(`Webhook Error: ${err.message}`);
    }

    console.log('🚀 ~ event.type', event.type);

    try {
      switch (event.type) {
        case 'capability.updated':
          await this.handleCapabilityEvent(
            event.data.object as Stripe.Capability,
          );
          break;

        case 'account.updated':
          await this.handleAccountUpdatedFallback(
            event.data.object as Stripe.Account,
          );
          break;
        case 'payout.paid':
          await this.handlePayoutPaid(event.data.object as Stripe.Payout);
          break;

        case 'payout.failed':
          await this.handlePayoutFailed(event.data.object as Stripe.Payout);
          break;
        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      this.logger.error(`Webhook processing failed: ${err.message}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send();
    }
  }

  private async handleAccountUpdatedFallback(account: Stripe.Account) {
    if (account.capabilities?.transfers === 'active') {
      this.logger.log(`Fallback: Transfers active detected for ${account.id}`);
      const fakeCapability = {
        id: 'transfers',
        status: 'active',
        account: account.id,
      } as any;
      await this.handleCapabilityEvent(fakeCapability);
    }
  }

  private async handleCapabilityEvent(capability: Stripe.Capability) {
    if (capability.id !== 'transfers') return;

    if (capability.status === 'active') {
      const accountId =
        typeof capability.account === 'string'
          ? capability.account
          : capability.account.id;

      this.logger.log(`Transfers capability active for account: ${accountId}`);

      const pendingWithdrawals = await this.prisma.withdrawal.findMany({
        where: {
          stripeAccountId: accountId,
          status: 'PENDING',
        },
      });

      for (const withdrawal of pendingWithdrawals) {
        await this.prisma.withdrawal.update({
          where: { id: withdrawal.id },
          data: { status: 'READY' },
        });

        this.logger.log(`Withdrawal ${withdrawal.id} marked READY`);
        // Background job can pick this withdrawal and create transfer/payout
        this.logger.log(
          `Withdrawal ${withdrawal.id} marked READY for processing`,
        );
        // Push to background job
        // await this.withdrawalQueue.add('process-withdrawal', {
        //   withdrawalId: withdrawal.id,
        // });
        await this.withdrawalQueue.add(
          'process-withdrawal',
          { withdrawalId: withdrawal.id },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
      }
    }
  }
  private async handlePayoutPaid(payout: Stripe.Payout) {
    this.logger.log(`Payout paid: ${payout.id}`);

    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: { stripePayoutId: payout.id },
    });

    if (!withdrawal) {
      this.logger.warn(`No withdrawal found for payout ${payout.id}`);
      return;
    }

    await this.prisma.withdrawal.update({
      where: { id: withdrawal.id }, // always use the unique `id` here
      data: { status: 'COMPLETED', completedAt: new Date() },
    });

    this.logger.log(`Withdrawal ${withdrawal.id} marked COMPLETED`);
  }

  private async handlePayoutFailed(payout: Stripe.Payout) {
    this.logger.log(`Payout failed: ${payout.id}`);

    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: { stripePayoutId: payout.id },
    });

    if (!withdrawal) {
      this.logger.warn(`No withdrawal found for payout ${payout.id}`);
      return;
    }

    await this.prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { status: 'FAILED', failureReason: 'Payout failed' },
    });

    this.logger.log(`Withdrawal ${withdrawal.id} marked FAILED`);
  }
}
