import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { IdenfyService } from './idenfy.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { WebhookDto } from './dto/webhook.dto';
import { Public } from 'src/auth/auth.guard';

@Controller('idenfy')
export class IdenfyController {
  constructor(private readonly idenfyService: IdenfyService) {}
  @Public()
  @Post('start')
  async startKyc(@Body() body: CreateSessionDto) {
    return this.idenfyService.createSession(body.userId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Body() payload: WebhookDto) {
    // Optional: verify signature/header if provider sends one
    // e.g., const signature = headers['x-provider-signature'];
    // validate signature

    await this.idenfyService.handleWebhook(payload);
    return { received: true };
  }
}
