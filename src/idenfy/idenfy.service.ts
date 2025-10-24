import { HttpException, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { WebhookDto } from './dto/webhook.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IdenfyService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly apiBase: string;
  private readonly callbackUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('DENFY_API_KEY')!;
    this.apiSecret = this.configService.get<string>('DENFY_API_SECRET')!;
    this.apiBase =
      this.configService.get<string>('DENFY_API_BASE') ||
      'https://ivs.idenfy.com';
    this.callbackUrl = this.configService.get<string>('KYC_CALLBACK_URL')!;
  }

  async createSession(userId: string, metadata?: Record<string, any>) {
    console.log(this.apiKey, this.apiSecret, this.apiBase, this.callbackUrl);
    try {
      const payload = {
        clientId: userId,
        clientUserId: userId,
        metadata: metadata || {},
        callbackUrl: this.callbackUrl,
      };

      const response = await firstValueFrom(
        this.httpService.post(`${this.apiBase}/api/v2/token`, payload, {
          auth: {
            username: this.apiKey,
            password: this.apiSecret,
          },
        }),
      );

      return { authToken: response?.data?.authToken };
    } catch (error) {
      const err = error as AxiosError;
      console.error(
        '❌ Error creating KYC session:',
        err.response?.data || err.message,
      );
      throw new HttpException('Failed to start KYC verification', 500);
    }
  }
  async handleWebhook(payload: WebhookDto) {
    const { sessionToken, status, userId } = payload;

    // TODO: update your user table in DB
    console.log(
      `📩 Webhook received for user ${userId}: ${status} (session: ${sessionToken})`,
    );

    // Example:
    // await this.userRepository.update({ id: userId }, { kycStatus: status });

    return { success: true };
  }
}
