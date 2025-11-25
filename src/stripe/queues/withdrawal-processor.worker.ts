import { Processor, WorkerHost, OnQueueEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { StripeWithdrawalProcessor } from './stripe-withdrawal-processor.service';

interface WithdrawalJobData {
  withdrawalId: string;
}

@Processor('withdrawal-queue')
export class WithdrawalProcessorWorker extends WorkerHost {
  private readonly logger = new Logger(WithdrawalProcessorWorker.name);

  constructor(private readonly processor: StripeWithdrawalProcessor) {
    super();
  }

  async process(job: { data: WithdrawalJobData }) {
    const { withdrawalId } = job.data;
    this.logger.log(`Processing withdrawal job ${job} for ${withdrawalId}`);

    try {
      await this.processor.processWithdrawal(withdrawalId);
      this.logger.log(`✅ Withdrawal ${withdrawalId} processed successfully`);
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to process withdrawal ${withdrawalId}: ${error.message}`,
      );
    }
  }

  // Job started event
  @OnQueueEvent('active')
  onActive(job: any) {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
  }

  // Job failed event
  @OnQueueEvent('failed')
  onFailed(job: any, err: any) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`);
  }
}
