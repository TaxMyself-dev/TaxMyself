import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DocCreatePageRoutingModule } from './doc_create-routing.module';

import { DocCreatePage } from './doc-create.page';
import { SharedModule } from '../../shared/shared.module';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { Button } from 'primeng/button';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import { InputDateComponent } from "../../components/input-date/input-date.component";
import { InputNumberModule } from 'primeng/inputnumber';
import { RadioButtonModule } from 'primeng/radiobutton';
import { DialogModule } from 'primeng/dialog';
import { DynamicDialogModule } from 'primeng/dynamicdialog';
import { DialogService } from 'primeng/dynamicdialog';
import { TabMenuModule } from 'primeng/tabmenu';
import { TableModule } from 'primeng/table';
import { DocSuccessDialogComponent } from 'src/app/components/create-doc-success-dialog/create-doc-success-dialog.component';


@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DocCreatePageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    InputSelectComponent,
    InputTextComponent,
    ButtonComponent,
    DatePickerModule,
    InputDateComponent,
    InputNumberModule,
    RadioButtonModule,
    DialogModule,
    DynamicDialogModule,
    TabMenuModule,
    TableModule,
    DocSuccessDialogComponent
],
  declarations: [DocCreatePage, ],
  providers: [DialogService]
})
export class DocCreatePageModule {}

