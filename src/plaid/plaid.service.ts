import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PlaidApi,
  PlaidEnvironments,
  Configuration,
  LinkTokenCreateRequest,
  ItemPublicTokenExchangeRequest,
  AccountsGetRequest,
  TransactionsGetRequest,
  CountryCode,
  Products,
} from 'plaid';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private plaidClient: PlaidApi;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const configuration = new Configuration({
      basePath: this.getPlaidEnvironment(),
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.configService.get<string>('plaid.clientId'),
          'PLAID-SECRET': this.configService.get<string>('plaid.secret'),
        },
      },
    });

    this.plaidClient = new PlaidApi(configuration);
  }

  private getPlaidEnvironment(): string {
    const env = this.configService.get<string>('plaid.env');
    switch (env) {
      case 'sandbox':
        return PlaidEnvironments.sandbox;
      case 'development':
        return PlaidEnvironments.development;
      case 'production':
        return PlaidEnvironments.production;
      default:
        return PlaidEnvironments.sandbox;
    }
  }

  async createLinkToken(userId: string): Promise<string> {
    try {
      const request: LinkTokenCreateRequest = {
        user: {
          client_user_id: userId,
        },
        client_name: 'xtra-change',
        products: this.configService.get<string[]>(
          'plaid.products',
        ) as Products[],
        country_codes: this.configService.get<string[]>(
          'plaid.countryCodes',
        ) as CountryCode[],
        language: 'en',
      };

      const response = await this.plaidClient.linkTokenCreate(request);

      return response.data.link_token;
    } catch (error) {
      this.logger.error('Error creating link token:', error);
      throw error;
    }
  }

  async exchangePublicToken(publicToken: string, userId: string) {
    try {
      const request: ItemPublicTokenExchangeRequest = {
        public_token: publicToken,
      };

      const response = await this.plaidClient.itemPublicTokenExchange(request);
      const { access_token, item_id } = response.data;
      const accountsResponse = await this.plaidClient.accountsGet({
        access_token,
      });
      const accounts = accountsResponse.data.accounts;

      // Get institution info
      const itemResponse = await this.plaidClient.itemGet({ access_token });
      const institutionId = itemResponse.data.item.institution_id;

      let institutionName: string | null = null;
      if (institutionId) {
        const institutionResponse = await this.plaidClient.institutionsGetById({
          institution_id: institutionId,
          country_codes: ['US'] as CountryCode[], // type cast
        });
        institutionName = institutionResponse.data.institution?.name || null;
      }
      // 3️⃣ Save PlaidItem
      const plaidItem = await this.prisma.plaidItem.create({
        data: {
          userId,
          accessToken: access_token,
          itemId: item_id,
          institution: institutionName,
          status: 'active',
          accounts: {
            create: accounts.map((acct) => ({
              accountId: acct.account_id,
              name: acct.name,
              mask: acct.mask,
              type: acct.type,
              subtype: acct.subtype,
              currentBalance: acct.balances?.current ?? null,
              availableBalance: acct.balances?.available ?? null,
            })),
          },
        },
        include: { accounts: true },
      });

      return {
        plaidItem,
        accessToken: response.data.access_token,
        itemId: response.data.item_id,
      };
    } catch (error) {
      this.logger.error('Error exchanging public token:', error);
      throw error;
    }
  }

  async getAccounts(accessToken: string) {
    try {
      const request: AccountsGetRequest = {
        access_token: accessToken,
      };

      const response = await this.plaidClient.accountsGet(request);
      return response.data.accounts;
    } catch (error) {
      this.logger.error('Error fetching accounts:', error);
      throw error;
    }
  }

  async getTransactions(
    accessToken: string,
    startDate: string,
    endDate: string,
  ) {
    try {
      const request: TransactionsGetRequest = {
        access_token: accessToken,
        start_date: startDate,
        end_date: endDate,
      };

      const response = await this.plaidClient.transactionsGet(request);
      return response.data.transactions;
    } catch (error) {
      this.logger.error('Error fetching transactions:', error);
      throw error;
    }
  }
}
