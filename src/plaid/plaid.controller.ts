import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Req,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PlaidService } from './plaid.service';
import { Public } from 'src/auth/auth.guard';

@Controller('plaid')
export class PlaidController {
  constructor(private readonly plaidService: PlaidService) {}

  @Post('create-link-token')
  async createLinkToken(@Req() req) {
    const userId = req.user.id;
    const linkToken = await this.plaidService.createLinkToken(userId);
    return { link_token: linkToken };
  }

  @Post('exchange-public-token')
  async exchangePublicToken(@Req() req, @Body() body: { publicToken: string }) {
    const userId = req.user.id;
    const result = await this.plaidService.exchangePublicToken(
      body.publicToken,
      userId,
    );
    return result;
  }

  // @Get('accounts/:accessToken')
  // async getAccounts(@Param('accessToken') accessToken: string) {
  //   const accounts = await this.plaidService.getAccounts(accessToken);
  //   return { accounts };
  // }
  @Get('users/accounts')
  async getUserAccounts(@Req() req) {
    const userId = req.user.id;
    return this.plaidService.getUserAccounts(userId);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
  ) {
    const userId = req.user.id;

    const transactions = await this.plaidService.getTransactions(
      userId,
      startDate,
      endDate,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
    return transactions;
  }
  @Public()
  @Get('oauth-return')
  handlePlaidOAuthReturn(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const params = new URLSearchParams(query).toString();

    // Redirect to your Android app via deep link
    const redirectUrl = `com.xtrachange://oauth-callback?${params}`;

    return res.redirect(redirectUrl);
  }
}
