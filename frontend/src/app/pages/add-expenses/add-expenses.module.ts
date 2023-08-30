import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AddExpensesPageRoutingModule } from './add-expenses-routing.module';

import { AddInvoicePage } from './add-expenses.page';
import { TableComponent } from 'src/app/shared/table/table.component';
import { ButtonComponent } from 'src/app/shared/button/button.component';
import { CustomToolbarComponent } from 'src/app/shared/custom-toolbar/custom-toolbar.component';
import { HomePageModule } from '../home/home.module';
import { SharedModule } from 'src/app/shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AddExpensesPageRoutingModule,
    HomePageModule,
    SharedModule
  ],
  declarations: [ AddInvoicePage,ButtonComponent],
  exports: [AddExpensesPageRoutingModule]
})
export class AddInvoicePageModule {}
