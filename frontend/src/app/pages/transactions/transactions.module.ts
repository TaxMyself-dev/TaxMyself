import { NgModule } from '@angular/core';
import { DirectCardNoticeComponent } from 'src/app/components/direct-card-notice/direct-card-notice.component';
import { OpenBankingErrorComponent } from 'src/app/components/open-banking-management/open-banking-error.component';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TransactionsPage } from './transactions.page';
import { TransactionsPageRoutingModule } from './transactions-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { TopNavComponent } from "../../components/topNav/topNav.component";
import { ImageBunnerComponent } from "../../components/image-bunner/image-bunner.component";
import { GenericTableComponent } from "../../components/generic-table/generic-table.component";
import { AccountAssociationDialogComponent } from "../../components/account-association-dialog/account-association-dialog.component";
import { AddBillComponent } from "../../components/add-bill/add-bill.component";
import { ClassifyTranComponent } from "../../components/classify-tran/classify-tran.component";
import { AddCategoryComponent } from "../../components/add-category/add-category.component";
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { FilterPanelComponent } from "../../components/filter-panel/filter-panell.component";
import { ButtonComponent } from "../../components/button/button.component";

@NgModule({
  imports: [
    DirectCardNoticeComponent,
    OpenBankingErrorComponent,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    TransactionsPageRoutingModule,
    TopNavComponent,
    ImageBunnerComponent,
    GenericTableComponent,
    AccountAssociationDialogComponent,
    AddBillComponent,
    ClassifyTranComponent,
    AddCategoryComponent,
    CheckboxModule,
    ToastModule,
    DialogModule,
    FilterPanelComponent,
    ButtonComponent
],
  declarations: [TransactionsPage]
})
export class TransactionsPageModule {}
