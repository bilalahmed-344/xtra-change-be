import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

@Injectable()
export class TwilioService {
  private client: Twilio.Twilio;
  private verifyServiceSid: string;
  private readonly logger = new Logger(TwilioService.name);

  constructor(private config: ConfigService) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID') ?? '';
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN') ?? '';
    this.verifyServiceSid =
      this.config.get<string>('TWILIO_VERIFY_SERVICE_SID') ?? '';

    if (!accountSid || !authToken || !this.verifyServiceSid) {
      this.logger.error('Twilio environment variables are missing!');
    }

    this.client = Twilio(accountSid, authToken);
  }

  async sendOtp(to: string, channel: 'sms' | 'call' = 'sms') {
    const verification = await this.client.verify.v2
      .services(this.verifyServiceSid)
      .verifications.create({ to, channel });

    this.logger.debug(
      `Sending OTP: { to: ${to}, channel: ${channel}, serviceSid: ${this.verifyServiceSid} }`,
    );

    return verification.sid; // return the sid so caller can store it
  }

  async verifyOtp(verificationSid: string, code: string) {
    return this.client.verify.v2
      .services(this.verifyServiceSid)
      .verificationChecks.create({ verificationSid, code });
  }
}
