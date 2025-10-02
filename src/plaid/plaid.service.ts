import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
import { calculateRoundUp, toCents } from 'src/utils/roundup';

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
        // redirect_uri: this.configService.get<string>('plaid.redirectUri'), // ✅ add this
        // redirect_uri: 'xtrachange://oauth-callback',
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
  // get accounts for the plaid
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

  async getUserAccounts(userId: string) {
    try {
      // Fetch all accounts from DB for this user
      const items = await this.prisma.plaidItem.findMany({
        where: { userId },
        include: { accounts: true },
      });

      // Flatten accounts if you want a simple list
      const accounts = items.flatMap((item) => item.accounts);

      return { accounts };
    } catch (error) {
      this.logger.error('Error fetching user accounts:', error);
      throw error;
    }
  }

  async getTransactions(
    accessToken: string,
    startDate?: string,
    endDate?: string,
    page: number = 1,
    limit: number = 20,
  ) {
    try {
      const today = new Date();
      const defaultEnd = today.toISOString().split('T')[0];
      const defaultStart = new Date(today.setDate(today.getDate() - 30))
        .toISOString()
        .split('T')[0];

      const request: TransactionsGetRequest = {
        access_token: accessToken,
        start_date: startDate || defaultStart,
        end_date: endDate || defaultEnd,
        options: {
          offset: (page - 1) * limit,
          count: limit,
        },
      };

      const response = await this.plaidClient.transactionsGet(request);
      const transactions = response.data.transactions;
      const total = response.data.total_transactions;
      // Save or update transactions in DB
      for (const tx of transactions) {
        // Find related PlaidAccount in DB
        const account = await this.prisma.plaidAccount.findUnique({
          where: { accountId: tx.account_id },
          include: { plaidItem: true },
        });

        if (!account) {
          this.logger.warn(`Account ${tx.account_id} not found, skipping tx.`);
          continue;
        }

        // Upsert transaction
        const plaidTx = await this.prisma.plaidTransaction.upsert({
          where: { transactionId: tx.transaction_id },
          update: {
            date: new Date(tx.date),
            name: tx.name,
            amount: tx.amount,
            category: tx.category?.join(', ') || null,
          },
          create: {
            plaidAccountId: account.id,
            transactionId: tx.transaction_id,
            date: new Date(tx.date),
            name: tx.name,
            amount: tx.amount,
            category: tx.category?.join(', ') || null,
          },
        });

        // 2 Calculate RoundUp
        const roundUpCents = calculateRoundUp(toCents(tx.amount));
        const roundUpAmount = roundUpCents / 100;

        if (roundUpAmount > 0) {
          // 3️⃣ Save RoundUpTransaction (skip if already exists)
          await this.prisma.roundUpTransaction.upsert({
            where: { plaidTransactionId: plaidTx.id },
            update: { roundUpAmount },
            create: {
              userId: account.plaidItem.userId,
              plaidTransactionId: plaidTx.id,
              roundUpAmount,
            },
          });
        }
      }

      // this.logger.log(`Synced ${transactions.length} transactions.`);

      return {
        transactions,
        metadata: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      if (error.response?.data?.error_code === 'INVALID_ACCESS_TOKEN') {
        throw new UnauthorizedException('Invalid Plaid access token');
      }
      this.logger.error('Error fetching transactions:', error);
      throw new BadRequestException('Failed to fetch transactions from Plaid');
    }
  }

  async getPendingRoundUpTotal(userId: string) {
    const result = await this.prisma.roundUpTransaction.aggregate({
      _sum: { roundUpAmount: true },
      where: {
        userId,
        status: 'PENDING',
      },
    });

    return result._sum.roundUpAmount ?? 0;
  }
}
