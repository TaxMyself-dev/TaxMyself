import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { IncomeStatementPageRoutingModule } from './income-statement-routing.module';

import { IncomeStatementPage } from './income-statement.page';
import { SharedModule } from 'src/app/shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    IncomeStatementPageRoutingModule,
    SharedModule
  ],
  declarations: [IncomeStatementPage]
})
export class IncomeStatementPageModule {}
