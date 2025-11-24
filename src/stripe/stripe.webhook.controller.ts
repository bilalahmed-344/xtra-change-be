// src/stripe/stripe-webhook.controller.ts
import { Controller, Post, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { StripeService } from './stripe.service';
import { Public } from 'src/auth/auth.guard';

@Controller('stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
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
    this.logger.error(`Webhook signature verification failed: ${sig}`);
    let event: Stripe.Event;

    if (!endpointSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is not defined in environment variables',
      );
    }

    try {
      // Verify webhook signature
      // event = this.stripeService.constructEvent(req.body, sig, endpointSecret);
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
          await this.handleCapabilityUpdated(
            event.data.object as Stripe.Capability,
          );
          break;
        // ADD THIS → catches test mode + some live edge cases
        case 'account.updated':
          // await this.handleAccountUpdated(event.data.object as Stripe.Account);
          const account = event.data.object as Stripe.Account;
          if (account.capabilities?.transfers === 'active') {
            this.logger.log(
              `Fallback: transfers active via account.updated for ${account.id}`,
            );
            const fakeCapability = {
              id: 'transfers',
              status: 'active',
              account: account.id,
            } as any;
            await this.handleCapabilityUpdated(fakeCapability);
          }
          break;

        case 'payout.paid':
        case 'payout.failed':
          await this.handlePayoutEvent(event);
          break;

        default:
          this.logger.log(`Unhandled event type: ${event.type}`);
      }
      res.json({ received: true });
    } catch (err) {
      this.logger.error(`Webhook handling failed: ${err.message}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send();
    }
  }

  private async handleCapabilityUpdated(capability: Stripe.Capability) {
    this.logger.log(
      `Processing capability.updated for capability: ${capability.id}`,
    );

    if (capability.id !== 'transfers') return; // We only care about transfers capability

    if (capability.status === 'active') {
      const accountId =
        typeof capability.account === 'string'
          ? capability.account
          : capability.account.id;

      // Find user by Stripe Connect account

      const user = await this.prisma.user.findUnique({
        where: { stripeConnectId: accountId } as any,
      });
      if (!user) return;

      // Fetch all pending withdrawals
      const pendingWithdrawals = await this.prisma.withdrawal.findMany({
        where: { stripeAccountId: accountId, status: 'PENDING' },
      });

      for (const withdrawal of pendingWithdrawals) {
        try {
          // 1️ Create a Transfer from platform to connected account
          const amountInCents = Math.round(withdrawal.amount * 100);

          const transfer = await this.stripeService.createTransfer({
            amount: amountInCents,
            destination: accountId,
            metadata: { withdrawalId: withdrawal.id },
          });
          console.log(
            '🚀 ~ StripeWebhookController ~ handleCapabilityUpdated ~ transfer:',
            transfer,
          );

          const payout = await this.stripeService.createPayout(
            accountId,
            amountInCents,
          );

          await this.prisma.withdrawal.update({
            where: { id: withdrawal.id },
            data: {
              status: 'PROCESSING',
              stripePayoutId: payout.id,
              stripeTransferId: transfer.id,
              processedAt: new Date(),
            },
          });

          this.logger.log(`Payout created for withdrawal ${withdrawal.id}`);
        } catch (error) {
          await this.prisma.withdrawal.update({
            where: { id: withdrawal.id },
            data: { status: 'FAILED', failureReason: error.message },
          });

          this.logger.error(
            `Failed payout for withdrawal ${withdrawal.id}: ${error.message}`,
          );
        }
      }
    }
  }

  private async handlePayoutEvent(event: Stripe.Event) {
    const payout = event.data.object as Stripe.Payout;
    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: { stripePayoutId: payout.id },
    });

    if (!withdrawal) return;

    if (event.type === 'payout.paid') {
      await this.prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'COMPLETED' },
      });
    } else if (event.type === 'payout.failed') {
      await this.prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { status: 'FAILED', failureReason: 'Payout failed in Stripe' },
      });
    }
  }

  // ——————————————————————————
  // Handle account.updated fallback
  // ——————————————————————————
  private async handleAccountUpdated(account: Stripe.Account) {
    if (account.capabilities?.transfers === 'active') {
      const fakeCapability = {
        id: 'transfers',
        status: 'active',
        account: account.id,
      } as any;

      this.logger.log(
        `Fallback transfer-activation detected for ${account.id}`,
      );
      await this.handleCapabilityUpdated(fakeCapability);
    }
  }
}
