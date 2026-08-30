import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ArchivedDocumentsPage } from './archived-documents.page';
import { ArchivedDocumentsPageRoutingModule } from './archived-documents-routing.module';
import { SharedModule } from '../../../shared/shared.module';
import { GenericTableComponent } from "src/app/components/generic-table/generic-table.component";
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";
import { ArchiveExpenseApprovalDialogComponent } from 'src/app/components/archive-expense-approval-dialog/archive-expense-approval-dialog.component';
import { DialogModule } from 'primeng/dialog';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ArchivedDocumentsPageRoutingModule,
    SharedModule,
    GenericTableComponent,
    FilterTabComponent,
    ArchiveExpenseApprovalDialogComponent,
    DialogModule,
  ],
  declarations: [ArchivedDocumentsPage],
})
export class ArchivedDocumentsPageModule {}
