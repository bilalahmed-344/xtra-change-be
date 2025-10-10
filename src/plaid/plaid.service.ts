import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
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
import { decrypt, encrypt } from 'src/utils/crypto.util';
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

      const encryptedToken = encrypt(access_token);

      // 3️⃣ Save PlaidItem
      const plaidItem = await this.prisma.plaidItem.create({
        data: {
          userId,
          accessToken: encryptedToken,
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
        access_token: encryptedToken,
        itemId: response.data.item_id,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = error.meta?.target as string[] | undefined;
          if (target?.includes('accountId')) {
            throw new Error('This bank account is already linked.');
          }
        }
      }

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

  // async getTransactions(
  //   userId: string,
  //   startDate?: string,
  //   endDate?: string,
  //   page: number = 1,
  //   limit: number = 20,
  // ) {
  //   try {
  //     const plaidItem = await this.prisma.plaidItem.findFirst({
  //       where: { userId },
  //     });

  //     if (!plaidItem) {
  //       throw new BadRequestException('Plaid item not found for user');
  //     }

  //     const today = new Date();
  //     const defaultEnd = today.toISOString().split('T')[0];
  //     const defaultStart = new Date(today.setDate(today.getDate() - 30))
  //       .toISOString()
  //       .split('T')[0];
  //     const accessToken = decrypt(plaidItem.accessToken);
  //     const request: TransactionsGetRequest = {
  //       access_token: accessToken,
  //       start_date: startDate || defaultStart,
  //       end_date: endDate || defaultEnd,
  //       options: {
  //         offset: (page - 1) * limit,
  //         count: limit,
  //       },
  //     };

  //     const response = await this.plaidClient.transactionsGet(request);
  //     const transactions = response?.data?.transactions || [];

  //     const total = response.data.total_transactions;
  //     // Save or update transactions in DB
  //     for (const tx of transactions) {
  //       const isDebit = (() => {
  //         // primary: amount sign
  //         if (typeof tx.amount === 'number') {
  //           if (tx.amount > 0) return true; // money leaving account
  //           if (tx.amount < 0) return false; // money entering account
  //         }
  //         // fallback: transaction_type if present (DEBIT / CREDIT / MEMO)
  //         if (tx.transaction_type) {
  //           const tType = String(tx.transaction_type).toUpperCase();
  //           return tType === 'DEBIT' || tType === 'MEMO';
  //         }
  //         // Fallback default: skip if uncertain
  //         return false;
  //       })();

  //       if (!isDebit) {
  //         // skip credits / incoming transfers
  //         continue;
  //       }
  //       // Find related PlaidAccount in DB
  //       const account = await this.prisma.plaidAccount.findUnique({
  //         where: { accountId: tx.account_id },
  //         include: { plaidItem: true },
  //       });

  //       if (!account) {
  //         this.logger.warn(`Account ${tx.account_id} not found, skipping tx.`);
  //         continue;
  //       }

  //       // Upsert transaction
  //       const plaidTx = await this.prisma.plaidTransaction.upsert({
  //         where: { transactionId: tx.transaction_id },
  //         update: {
  //           date: new Date(tx.date),
  //           name: tx.name,
  //           amount: tx.amount,
  //           category: tx.category?.join(', ') || null,
  //         },
  //         create: {
  //           plaidAccountId: account.id,
  //           transactionId: tx.transaction_id,
  //           date: new Date(tx.date),
  //           name: tx.name,
  //           amount: tx.amount,
  //           category: tx.category?.join(', ') || null,
  //         },
  //       });

  //       // 2 Calculate RoundUp
  //       const roundUpCents = calculateRoundUp(toCents(tx.amount));
  //       const roundUpAmount = roundUpCents / 100;

  //       if (roundUpAmount > 0) {
  //         // 3️⃣ Save RoundUpTransaction (skip if already exists)
  //         await this.prisma.roundUpTransaction.upsert({
  //           where: { plaidTransactionId: plaidTx.id },
  //           update: { roundUpAmount },
  //           create: {
  //             userId: account.plaidItem.userId,
  //             plaidTransactionId: plaidTx.id,
  //             roundUpAmount,
  //           },
  //         });
  //       }
  //     }

  //     return {
  //       transactions,
  //       metadata: {
  //         page,
  //         limit,
  //         total,
  //         totalPages: Math.ceil(total / limit),
  //       },
  //     };
  //   } catch (error) {
  //     if (error.response?.data?.error_code === 'INVALID_ACCESS_TOKEN') {
  //       throw new UnauthorizedException('Invalid Plaid access token');
  //     }
  //     this.logger.error('Error fetching transactions:', error);
  //     throw new BadRequestException('Failed to fetch transactions from Plaid');
  //   }
  // }
  async getTransactions(
    userId: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 20,
  ) {
    try {
      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);

      // Step 1: Find all PlaidAccounts linked to user's PlaidItems
      const accounts = await this.prisma.plaidAccount.findMany({
        where: { plaidItem: { userId } },
        select: { id: true },
      });

      if (accounts.length === 0) {
        throw new BadRequestException('No Plaid accounts found for this user');
      }

      const accountIds = accounts.map((a) => a.id);

      // Step 2: Get transactions from those accounts
      const [transactions, total] = await Promise.all([
        this.prisma.plaidTransaction.findMany({
          where: {
            plaidAccountId: { in: accountIds },
            date: Object.keys(dateFilter).length ? dateFilter : undefined,
            amount: { gt: 0 },
          },
          include: {
            account: {
              select: {
                name: true,
                type: true,
                plaidItem: { select: { institution: true } },
              },
            },
          },
          orderBy: { date: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.plaidTransaction.count({
          where: {
            plaidAccountId: { in: accountIds },
            date: Object.keys(dateFilter).length ? dateFilter : undefined,
            amount: { gt: 0 },
          },
        }),
      ]);

      return {
        userId,
        transactions,
        metadata: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      this.logger.error('Error fetching transactions from DB:', error);
      throw new BadRequestException('Failed to fetch transactions');
    }
  }
}
