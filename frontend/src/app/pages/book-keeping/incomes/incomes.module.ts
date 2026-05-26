import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IncomesPage } from './incomes.page';
import { IncomesPageRoutingModule } from './incomes-routing.module';
import { SharedModule } from '../../../shared/shared.module';
import { CardNavigateComponent } from "src/app/components/card-navigate/card-navigate.component";
import { TabMenu } from "primeng/tabmenu";
import { GenericTableComponent } from "src/app/components/generic-table/generic-table.component";
import { PeriodSelectComponent } from "src/app/components/period-select/period-select.component";
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";
// import { Overlay } from "../../../../../node_modules/primeng/overlay/overlay";
import { PopoverModule } from 'primeng/popover';
import { DialogModule } from 'primeng/dialog';
import { DialogService } from 'primeng/dynamicdialog';
import { ButtonComponent } from 'src/app/components/button/button.component';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IncomesPageRoutingModule,
    SharedModule,
    CardNavigateComponent,
    TabMenu,
    GenericTableComponent,
    PeriodSelectComponent,
    FilterTabComponent,
    // Overlay,
    PopoverModule,
    DialogModule,
    ButtonComponent,
  ],
  declarations: [IncomesPage],
  providers: [DialogService],
})
export class IncomesPageModule {}
