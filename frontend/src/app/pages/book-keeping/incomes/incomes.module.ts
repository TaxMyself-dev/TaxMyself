import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IncomesPage } from './incomes.page';
import { IncomesPageRoutingModule } from './incomes-routing.module';
import { SharedModule } from '../../../shared/shared.module';
import { CardNavigateComponent } from "src/app/components/card-navigate/card-navigate.component";
import { TabMenu } from "primeng/tabmenu";
import { GenericTableComponent } from "src/app/components/generic-table/generic-table.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IncomesPageRoutingModule,
    SharedModule,
    CardNavigateComponent,
    TabMenu,
    GenericTableComponent
],
  declarations: [IncomesPage]
})
export class IncomesPageModule {}
