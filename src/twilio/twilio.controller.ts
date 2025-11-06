import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { TwilioService } from './twilio.service';

@Controller('twilio')
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  @Post('send-otp')
  async sendOtp(@Body('phone') phone: string) {
    if (!phone) throw new BadRequestException('Phone number is required.');

    const response = await this.twilioService.sendOtp(phone);
    return {
      success: true,
      message: `OTP sent successfully to ${phone}`,
      response,
    };
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: { phone: string; code: string }) {
    const { phone, code } = body;

    if (!phone || !code)
      throw new BadRequestException('Phone number and code are required.');

    const result = await this.twilioService.verifyOtp(phone, code);

    return {
      success: result.status === 'approved',
      status: result.status,
      message:
        result.status === 'approved'
          ? 'OTP verified successfully ✅'
          : 'OTP verification failed ❌',
    };
  }
}
