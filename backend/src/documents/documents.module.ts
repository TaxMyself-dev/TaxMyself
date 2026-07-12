import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { DocumentsService,  } from './documents.service';
import { DocumentsController } from './documents.controller';
import { SettingDocuments } from './settingDocuments.entity';
import { Documents } from './documents.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { DocLines } from './doc-lines.entity';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { BookingAccount } from 'src/bookkeeping/account.entity';
import { AccountingSection } from 'src/bookkeeping/accounting-section.entity';
import { Category } from 'src/bookkeeping/category.entity';
import { SubCategory } from 'src/bookkeeping/sub-category.entity';
import { CatalogService } from 'src/bookkeeping/catalog.service';
import { AccountCodeAllocatorService } from 'src/bookkeeping/account-code-allocator.service';
import { SharedService } from 'src/shared/shared.service';
import { FxRateService } from 'src/shared/fx-rate.service';
import { FxRate } from 'src/shared/fx-rate.entity';
import { Expense } from 'src/expenses/expenses.entity';
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: wiring leftover — Transactions registered to satisfy SharedService injection. Not used by DocumentsService or BookkeepingService directly. Remove when SharedService is cleaned up.
import { Transactions } from 'src/transactions/transactions.entity';
import { BookkeepingService } from 'src/bookkeeping/bookkeeping.service';
import { DocPayments } from './doc-payments.entity';
import { Business } from 'src/business/business.entity';
import { BusinessService } from 'src/business/business.service';
import { MailModule } from 'src/mail/mail.module';
import { User } from 'src/users/user.entity';
import { ExtractedDocument } from './extracted-document.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { DocumentProcessorService } from './document-processor.service';
import { DocumentPairingService } from './document-pairing.service';
import { GoogleDriveModule } from '../google-drive/google-drive.module';
import { Supplier } from '../expenses/suppliers.entity';
import { UsersModule } from '../users/users.module';
import { BillingModule } from 'src/billing/billing.module';


@Module({
  imports: [
    TypeOrmModule.forFeature([SettingDocuments, Documents, Expense, Transactions, DocLines, DocPayments, Business, Delegation, JournalEntry, JournalLine, BookingAccount, AccountingSection, Category, SubCategory, User, ExtractedDocument, Supplier, FxRate, SlimTransaction]),
    MailModule,
    GoogleDriveModule,
    forwardRef(() => UsersModule),
    forwardRef(() => BillingModule),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    SharedService,
    FxRateService,
    BookkeepingService,
    CatalogService,
    AccountCodeAllocatorService,
    BusinessService,
    DocumentProcessorService,
    DocumentPairingService,
  ],
  exports: [DocumentsService, DocumentProcessorService, DocumentPairingService], // Export for use in other modules
})
export class DocumentsModule {}