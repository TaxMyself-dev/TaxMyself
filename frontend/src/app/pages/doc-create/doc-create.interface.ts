import { ValidatorFn } from "@angular/forms";
import { fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes } from "src/app/shared/enums";

export interface ICreateDocSectionData {
    key: SectionKeysEnum;
    baseFields: FieldsCreateDocValue[] | fieldLineDocValue[];
    expandable: boolean;
    expandedFields: FieldsCreateDocValue[] | fieldLineDocValue[]; 
}

export type SectionKeysEnum = 'GeneralDetails' | 'ReceiptPaymentDetails' | 'TaxInvoicePaymentDetails' | 'UserDetails' | 'Document Summary' ;

export interface IDocCreateFieldData {
    name: FieldsCreateDocName | fieldLineDocName;
    value: string;
    type: FormTypes; 
    enumValues: { [key: string]: string }[];
    editFormBasedOnValue: { [key: string]: FieldsCreateDocName[] | fieldLineDocValue[]};  
    validators?: ValidatorFn[];   
    initialValue?: any;     
}