import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { IClient } from 'src/app/pages/doc-create/doc-create.interface';
import { ClientsTableColumns, FormTypes } from 'src/app/shared/enums';
import { IBaseFieldData } from 'src/app/shared/interface';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AddClientService {


  readonly addClientFields: Record<ClientsTableColumns, IBaseFieldData> = {
    // General Details 
    [ClientsTableColumns.NAME]: {
      //name: FieldsCreateDocName.typeFile,
      value: ClientsTableColumns.NAME,
      labelText: 'שם הלקוח',
      placeHolder: 'הקלד את שם הלקוח',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.required]
    },
    [ClientsTableColumns.PHONE]: {
      value: ClientsTableColumns.PHONE,
      labelText: 'טלפון',
      placeHolder: 'טלפון',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.pattern(/^(05[0-9]\d{7}|0[23489]\d{7})$/)
      ]
    },
    [ClientsTableColumns.EMAIL]: {
      value: ClientsTableColumns.EMAIL,
      labelText: 'אימייל',
      placeHolder: 'example@example.com',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
    },
    [ClientsTableColumns.ID]: {
      value: ClientsTableColumns.ID,
      labelText: 'תעודת זהות או ח.פ.',
      placeHolder: 'הקלד 9 ספרות',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.pattern(/^\d{9}$/)
]
    },
    [ClientsTableColumns.CITY]: {
      value: ClientsTableColumns.CITY,
      labelText: 'עיר',
      placeHolder: 'עיר',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: []
    },
    [ClientsTableColumns.STREET]: {
      value: ClientsTableColumns.STREET,
      labelText: 'רחוב',
      placeHolder: 'רחוב',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: []
    },
    [ClientsTableColumns.HOME_NUMBER]: {
      value: ClientsTableColumns.HOME_NUMBER,
      labelText: 'מספר בית',
      placeHolder: 'מספר בית',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: []
    },
    [ClientsTableColumns.POSTAL_CODE]: {
      value: ClientsTableColumns.POSTAL_CODE,
      labelText: 'מיקוד',
      placeHolder: 'מיקוד',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: []
    },
    [ClientsTableColumns.STATE]: {
      value: ClientsTableColumns.STATE,
      labelText: 'מדינה',
      placeHolder: 'מדינה',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: []
    },
    [ClientsTableColumns.STATE_CODE]: {
      value: ClientsTableColumns.STATE_CODE,
      labelText: 'קוד מדינה',
      placeHolder: 'קוד מדינה',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: []
    },
  }

  /**
   * Creates a FormGroup for a new client based on addClientFields configuration
   * @returns FormGroup with all client fields and validators
   */
  createClientForm(): FormGroup {
    const formControls: { [key: string]: FormControl } = {};

    // Iterate through all fields and create a FormControl for each
    Object.keys(this.addClientFields).forEach((fieldKey) => {
      const fieldData = this.addClientFields[fieldKey as ClientsTableColumns];

      // Create FormControl with initial value and validators
      formControls[fieldKey] = new FormControl(
        fieldData.initialValue ?? '',
        fieldData.validators || []
      );
    });

    // Return new FormGroup with all controls
    return new FormGroup(formControls);
  }

  private http = inject(HttpClient);

  clients = httpResource<IClient[]>(() => ({
    url: `${environment.apiUrl}clients/get-clients`,
    method: 'GET',
  }));


    saveClientDetails(data: IClient): Observable<any> {
      const url = `${environment.apiUrl}clients/add-client`;
      return this.http.post<any>(url, data);
    }
  
}


