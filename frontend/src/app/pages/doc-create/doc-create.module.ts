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
import { TabMenuModule } from 'primeng/tabmenu';


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
    TabMenuModule
],
  declarations: [DocCreatePage]
})
export class DocCreatePageModule {}
