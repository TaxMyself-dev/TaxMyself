import { Component, inject, signal } from '@angular/core';
import { GenericTableComponent } from "../generic-table/generic-table.component";
import { AddClientService } from './add-client.service';
import { IColumnDataTable } from 'src/app/shared/interface';
import { FormTypes, inputsSize } from 'src/app/shared/enums';
import { InputTextComponent } from "../input-text/input-text.component";
import { ReactiveFormsModule } from '@angular/forms';
import { KeyValuePipe } from '@angular/common';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { catchError, EMPTY } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DynamicDialogConfig, DynamicDialogRef } from 'primeng/dynamicdialog';
import { IClient } from 'src/app/pages/doc-create/doc-create.interface';
import { ClientKeys, ClientValues } from 'src/app/shared/types';

@Component({
  selector: 'app-add-client',
  templateUrl: './add-client.component.html',
  styleUrls: ['./add-client.component.scss'],
  standalone: true,
  imports: [KeyValuePipe, GenericTableComponent, InputTextComponent, ReactiveFormsModule, ButtonComponent],
  providers: [AddClientService]
})
export class AddClientComponent {
  addClientService = inject(AddClientService);
  messageService = inject(MessageService);
  confirmationService = inject(ConfirmationService);
  dialogRef = inject(DynamicDialogRef);
  dialogConfig = inject(DynamicDialogConfig);

  inputSize = inputsSize;
  buttonColor = ButtonColor;
  buttonSize = ButtonSize;

  addClientForm = this.addClientService.createClientForm();
  editMode = this.dialogConfig.data?.editMode === true;
  clientRowId: number | null = this.dialogConfig.data?.client?.clientRowId ?? null;

  constructor() {
    if (this.editMode && this.dialogConfig.data?.client) {
      const c = this.dialogConfig.data.client as IClient & { clientRowId?: number };
      this.addClientForm.patchValue({
        name: c.name ?? '',
        id: c.id ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        address: c.address ?? ''
      });
    }
    this.initialSnapshot = this.normalizedValues();
  }

  // Normalized form values right after the form is populated (edit-mode baseline)
  private initialSnapshot: Record<string, unknown>;

  // Same normalization as on save: trim strings, treat ''/null/undefined as null
  private normalizedValues(): Record<string, unknown> {
    const raw = this.addClientForm.getRawValue() as Record<string, unknown>;
    return Object.entries(raw).reduce((acc, [key, value]) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        acc[key] = trimmed === '' ? null : trimmed;
      } else {
        acc[key] = value ?? null;
      }
      return acc;
    }, {} as Record<string, unknown>);
  }

  get hasChanges(): boolean {
    const current = this.normalizedValues();
    return Object.keys(current).some(k => current[k] !== (this.initialSnapshot[k] ?? null));
  }

  // Create: valid form. Edit: valid form and an actual change from the loaded data.
  get canSave(): boolean {
    return this.addClientForm.valid && (!this.editMode || this.hasChanges);
  }

  // Preserve original order for keyvalue pipe (prevents alphabetical sorting)
  preserveOrder = () => 0;

  clientsTableFields: IColumnDataTable<ClientKeys, ClientValues>[] = [
    { name: 'name', value: 'שם הלקוח', type: FormTypes.TEXT },
    { name: 'phone', value: 'טלפון', type: FormTypes.TEXT },
    { name: 'id', value: 'ת.ז. / ח.פ.', type: FormTypes.TEXT },
    { name: 'email', value: 'אימייל', type: FormTypes.TEXT },
  ];

  clients = signal<IClient[]>(this.dialogConfig.data?.clients ?? []);

  saveClient() {
    if (!this.canSave) return;
    const clientData = this.normalizedValues() as Partial<IClient>;

    if (this.editMode && this.clientRowId != null) {
      this.confirmationService.confirm({
        message: 'האם אתה בטוח שברצונך לעדכן את פרטי הלקוח?',
        header: 'עדכון לקוח',
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'כן, עדכן',
        rejectLabel: 'ביטול',
        accept: () => this.doUpdateClient(clientData),
        reject: () => {}
      });
      return;
    }

    clientData.businessNumber = this.dialogConfig.data?.businessNumber;
    this.addClientService.saveClientDetails(clientData)
      .pipe(
        catchError((err) => {
          console.log("err in save client: ", err);
          if (err.status === 409) {
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
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: "לקוח נשמר בהצלחה!",
          life: 3000,
          key: 'br'
        });
        this.cancel(clientData);
      });
  }

  private doUpdateClient(clientData: Partial<IClient>): void {
    if (this.clientRowId == null) return;
    this.addClientService.updateClient(this.clientRowId, clientData)
      .pipe(
        catchError((err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'לא הצלחנו לעדכן את הלקוח',
            life: 3000,
            key: 'br'
          });
          return EMPTY;
        })
      )
      .subscribe(() => {
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הלקוח עודכן בהצלחה',
          life: 3000,
          key: 'br'
        });
        this.cancel(clientData);
      });
  }

  cancel(data?: Partial<IClient>) {
    this.dialogRef.close(data);
  }
}
