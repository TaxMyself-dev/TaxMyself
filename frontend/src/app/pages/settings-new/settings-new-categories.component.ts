import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsNewSelectComponent } from './settings-new-select.component';
import { MyCategoriesTabComponent } from '../settings/my-categories-tab/my-categories-tab.component';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';

@Component({
  selector: 'app-settings-new-categories', standalone: true,
  imports: [CommonModule, FormsModule, SettingsNewSelectComponent, ConfirmDialogModule, ToastModule, DialogModule, CheckboxModule, InputNumberModule, InputTextModule, ButtonComponent, GenericTableComponent],
  providers: [ConfirmationService, MessageService],
  templateUrl: './settings-new-categories.component.html',
  styleUrls: ['./settings-new-categories.component.scss'],
})
export class SettingsNewCategoriesComponent extends MyCategoriesTabComponent {
  constructor(){super();this.rulesColumns=[...this.rulesColumns,{name:'createdBySourceLabel',value:'נוצר על ידי'},{name:'updatedBySourceLabel',value:'עודכן על ידי'}];}
}
