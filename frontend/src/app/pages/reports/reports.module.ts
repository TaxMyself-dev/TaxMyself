import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { ReportsPageRoutingModule } from './reports-routing.module';

import { ReportsPage } from './reports.page';
import { SharedModule } from '../../shared/shared.module';
import { CardNavigateComponent } from "../../components/card-navigate/card-navigate.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReportsPageRoutingModule,
    SharedModule,
    CardNavigateComponent
],
  declarations: [ReportsPage]
})
export class ReportsPageModule {}
