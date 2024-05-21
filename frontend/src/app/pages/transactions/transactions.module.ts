import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TransactionsPage } from './transactions.page';
import { TransactionsPageRoutingModule } from './transactions-routing.module';
import { SharedModule } from 'src/app/shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    SharedModule,
    TransactionsPageRoutingModule
  ],
  declarations: [TransactionsPage]
})
export class TransactionsPageModule {}
