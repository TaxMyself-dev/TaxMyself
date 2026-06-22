import { forwardRef, Module } from '@nestjs/common';
import { FeezbackModule } from '../feezback/feezback.module';
import { TypeOrmModule } from '@nestjs/typeorm'
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { TransactionProcessingService } from './transaction-processing.service';
import { AuthService } from '../users/auth.service';
import { Expense } from '../expenses/expenses.entity';
import { User } from '../users/user.entity';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: entity import and forFeature registration kept while TransactionsService still injects transactionsRepo. Remove import and remove Transactions from forFeature when all legacy methods are deleted.
import { Transactions } from './transactions.entity';
import { UsersModule } from '../users/users.module';
import { Child } from '../users/child.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { SharedModule } from '../shared/shared.module';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { SlimTransaction } from './slim-transaction.entity';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { UserTransactionCacheState } from './user-transaction-cache-state.entity';
import { UserSyncState } from './user-sync-state.entity';
import { UserSourceSyncState } from './user-source-sync-state.entity';
import { UserSyncStateService } from './user-sync-state.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { UserSubCategory } from '../expenses/user-sub-categories.entity';
import { DefaultSubCategory } from '../expenses/default-sub-categories.entity';
import { Supplier } from '../expenses/suppliers.entity';
import { DefaultCategory } from '../expenses/default-categories.entity';
import { UserCategory } from '../expenses/user-categories.entity';
import { FinsiteService } from 'src/finsite/finsite.service';
import { Finsite } from 'src/finsite/finsite.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { Business } from 'src/business/business.entity';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense, User, Business, Transactions, DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory,
            Supplier, ClassifiedTransactions, SlimTransaction, FullTransactionCache, UserTransactionCacheState, UserSyncState, UserSourceSyncState,
            Bill, Source, Child, Finsite, Delegation, SettingDocuments, ExtractedDocument]),
    // SharedModule provides SharedService AND FxRateService. Importing it (and
    // removing the local `SharedService` provider below) means both services
    // resolve through the same SharedModule instance — which is what the
    // FxRate DB-cache singleton actually needs.
    SharedModule,
    forwardRef(() => UsersModule),
    forwardRef(() => FeezbackModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionProcessingService,
    UserSyncStateService,
    ExpensesService,
    AuthService,
    FinsiteService
  ],
  exports: [TypeOrmModule, TransactionsService, TransactionProcessingService, UserSyncStateService],
})
export class TransactionsModule {}