import { ValidatorFn } from "@angular/forms";
import { fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes } from "src/app/shared/enums";
import { ISelectItem } from "src/app/shared/interface";

export interface ICreateDocSectionData {
    key: SectionKeysEnum;
    baseFields: FieldsCreateDocValue[] | fieldLineDocValue[];
    expandable: boolean;
    expandedFields: FieldsCreateDocValue[] | fieldLineDocValue[]; 
}

export type SectionKeysEnum = 'GeneralDetails' | 'ReceiptPaymentDetails' | 'TaxInvoicePaymentDetails' | 'UserDetails' | 'Document Summary' | 'LineDetails' | 'BANK_TRANSFER' | 'CREDIT_CARD' | 'APP' | 'CHECK' | 'CASH' ;

export interface IDocCreateFieldData {
    //name: FieldsCreateDocName | fieldLineDocName;
    value: string;
    labelText: string;
    placeHolder: string;
    type: FormTypes; 
    enumValues: ISelectItem[] | null;
    editFormBasedOnValue: { [key: string]: FieldsCreateDocName[] | fieldLineDocValue[]};  
    validators?: ValidatorFn[];   
    initialValue?: any;     
}