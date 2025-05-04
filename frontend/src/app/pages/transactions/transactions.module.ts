import { NgModule } from '@angular/core';
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

@NgModule({
  imports: [
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
    AddCategoryComponent
],
  declarations: [TransactionsPage]
})
export class TransactionsPageModule {}
