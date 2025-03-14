import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TransactionsPage } from './transactions.page';
import { TransactionsPageRoutingModule } from './transactions-routing.module';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    TransactionsPageRoutingModule
  ],
  declarations: [TransactionsPage]
})
export class TransactionsPageModule {}
