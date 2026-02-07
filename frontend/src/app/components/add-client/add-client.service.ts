import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { IClient } from 'src/app/pages/doc-create/doc-create.interface';
import { FormTypes } from 'src/app/shared/enums';
import { IBaseFieldData } from 'src/app/shared/interface';
import { ClientKeys } from 'src/app/shared/types';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AddClientService {

  readonly addClientFields: Record<ClientKeys, IBaseFieldData> = {
    // General Details 
    ['name']: {
      //name: FieldsCreateDocName.typeFile,
      value: 'name',
      labelText: 'שם הלקוח',
      placeHolder: 'הקלד את שם הלקוח',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.required]
    },
    ['phone']: {
      value: 'phone',
      labelText: 'טלפון',
      placeHolder: 'טלפון',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.pattern(/^(05[0-9]\d{7}|0[23489]\d{7})$/)
      ]
    },
    ['email']: {
      value: 'email',
      labelText: 'אימייל',
      placeHolder: 'example@example.com',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
    },
    ['id']: {
      value: 'id',
      labelText: 'תעודת זהות או ח.פ.',
      placeHolder: 'הקלד 9 ספרות',
      type: FormTypes.TEXT,
      initialValue: '',
      enumValues: [],
      validators: [Validators.pattern(/^\d{9}$/)
      ]
    },
    ['address']: {
      value: 'address',
      labelText: 'כתובת',
      placeHolder: 'כתובת',
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
      const fieldData = this.addClientFields[fieldKey as ClientKeys];

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


  saveClientDetails(data: Partial<IClient>): Observable<any> {
    const url = `${environment.apiUrl}clients/add-client`;
    return this.http.post<any>(url, data);
  }

}


