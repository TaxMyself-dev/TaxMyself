import { Component, computed, effect, inject, OnInit } from '@angular/core';
import { GenericTableComponent } from "../generic-table/generic-table.component";
import { Dialog } from "primeng/dialog";
import { AddClientService } from './add-client.service';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import { ClientsTableColumns, ClientsTableHebrewColumns, FormTypes, inputsSize } from 'src/app/shared/enums';
import { InputTextComponent } from "../input-text/input-text.component";
import { ReactiveFormsModule } from '@angular/forms';
import { KeyValuePipe } from '@angular/common';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { catchError, EMPTY } from 'rxjs';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-add-client',
  templateUrl: './add-client.component.html',
  styleUrls: ['./add-client.component.scss'],
  standalone: true,
  imports: [KeyValuePipe, GenericTableComponent, InputTextComponent, ReactiveFormsModule, ButtonComponent],

})
export class AddClientComponent {
  addClientService = inject(AddClientService);
  messageService = inject(MessageService);

  inputSize = inputsSize;
  buttonColor = ButtonColor;
  buttonSize = ButtonSize;

  addClientForm = this.addClientService.createClientForm();

  // Preserve original order for keyvalue pipe (prevents alphabetical sorting)
  preserveOrder = () => 0;

  clientsTableFields: IColumnDataTable<ClientsTableColumns, ClientsTableHebrewColumns>[] = [
    { name: ClientsTableColumns.NAME, value: ClientsTableHebrewColumns.name, type: FormTypes.TEXT },
    { name: ClientsTableColumns.PHONE, value: ClientsTableHebrewColumns.phone, type: FormTypes.TEXT },
    { name: ClientsTableColumns.EMAIL, value: ClientsTableHebrewColumns.email, type: FormTypes.TEXT },
    { name: ClientsTableColumns.CITY, value: ClientsTableHebrewColumns.city, type: FormTypes.TEXT },
    { name: ClientsTableColumns.STREET, value: ClientsTableHebrewColumns.street, type: FormTypes.TEXT },
  ];

  constructor() {
    effect(() => {
      // this.clients = this.addClientService.clients();
      console.log(this.clients.value());

    });
  }
  clients = this.addClientService.clients;

  saveClient() {
    const clientData = this.addClientForm.value;
    this.addClientService.saveClientDetails(clientData)
      .pipe(
        catchError((err) => {
          console.log("err in save client: ", err);
          if (err.status === 409) {
            // this.genericService.openPopupMessage("כבר קיים לקוח בשם זה, אנא בחר שם שונה. אם ברצונך לערוך לקוח זה אנא  לחץ על כפתור עריכה דרך הרשימה .");
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: "כבר קיים לקוח בשם זה, אנא בחר שם שונה. אם ברצונך לערוך לקוח זה אנא  לחץ על כפתור עריכה דרך הרשימה .",
              life: 3000,
              sticky: true,
              key: 'br'
            })
          }
          else {
            // this.genericService.showToast("אירעה שגיאה לא ניתן לשמור לקוח אנא נסה מאוחר יותר", "error");
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: "אירעה שגיאה לא ניתן לשמור לקוח אנא נסה מאוחר יותר!",
              life: 3000,
              sticky: true,
              key: 'br'
            })
          }
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("res in save client: ", res);
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: "לקוח נשמר בהצלחה!",
          life: 3000,
          key: 'br'
        })
      })
  }
}
