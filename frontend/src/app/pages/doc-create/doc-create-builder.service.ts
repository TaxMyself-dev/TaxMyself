import { Injectable } from "@angular/core";
import { CardCompany, CreateDocFields, CreditTransactionType, Currency, CurrencyHebrew, fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodValue, UnitOfMeasure, vatOptions } from "src/app/shared/enums";
import { ICreateDocSectionData, IDocCreateFieldData, SectionKeysEnum } from "./doc-create.interface";
import { FormArray, FormControl, FormGroup, Validators } from "@angular/forms";
import { DocTypeDisplayName, DocCreateFields } from "./doc-cerate.enum";

@Injectable({
    providedIn: 'root'
})
export class DocCreateBuilderService {

    readonly currencyList = [
        { value: Currency.ILS, name: CurrencyHebrew.ILS },
        { value: Currency.USD, name: CurrencyHebrew.USD },
        { value: Currency.EUR, name: CurrencyHebrew.EUR },
    ];

    lineDetailsColumns = [
        { field: FieldsCreateDocValue.LINE_DESCRIPTION, header: 'תיאור'},
        { field: FieldsCreateDocValue.UNIT_AMOUNT, header: 'כמות'},
        { field: FieldsCreateDocValue.VAT_OPTIONS, header: 'מע"מ'},
        { field: FieldsCreateDocValue.SUM, header: 'סכום'},
        { field: FieldsCreateDocValue.DISCOUNT, header: 'הנחה'},
        { field: 'action', header: ''}
    ];

    readonly docCreateBuilderData: Record<CreateDocFields, IDocCreateFieldData> = {
        // General Details 
        [FieldsCreateDocValue.DOC_TYPE]: {
            //name: FieldsCreateDocName.typeFile,
            value: FieldsCreateDocValue.DOC_TYPE,
            labelText: 'סוג המסמך',
            placeHolder: 'בחר את סוג המסמך',
            type: FormTypes.DDL,
            initialValue: '',
            enumValues: Object.entries(DocTypeDisplayName).map(([value, name]) => ({ value, name })),
            editFormBasedOnValue: {},
            validators: [Validators.required]
        },
        [FieldsCreateDocValue.DOC_DESCRIPTION]: {
            //name: FieldsCreateDocName.docDescription,
            value: FieldsCreateDocValue.DOC_DESCRIPTION,
            labelText: 'תיאור מסמך (לא מוצג ללקוח)',
            placeHolder: 'תיאור המסמך',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.DOCUMENT_DATE]: {
            //name: FieldsCreateDocName.documentDate,
            value: FieldsCreateDocValue.DOCUMENT_DATE,
            labelText: 'תאריך המסמך',
            placeHolder: '00/00/0000',
            type: FormTypes.DATE,
            initialValue: new Date(),
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.required]
        },
        [FieldsCreateDocValue.DOC_VAT_RATE]: {
            //name: FieldsCreateDocName.docVatRate,
            value: FieldsCreateDocValue.DOC_VAT_RATE,
            labelText: 'אחוז המע"מ',
            placeHolder: 'אחוז המע"מ',
            type: FormTypes.TEXT,
            initialValue: 18,
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.required]
        },
        [FieldsCreateDocValue.CURRENCY]: {
            //name: FieldsCreateDocName.currency,
            value: FieldsCreateDocValue.CURRENCY,
            labelText: 'מטבע',
            placeHolder: 'בחר את סוג המטבע',
            type: FormTypes.DDL,
            initialValue: this.currencyList[0].value,
            enumValues: this.currencyList,
            editFormBasedOnValue: {},
            validators: [Validators.required]
        },
        // User Details
        [FieldsCreateDocValue.RECIPIENT_NAME]: {
            //name: FieldsCreateDocName.recipientName,
            value: FieldsCreateDocValue.RECIPIENT_NAME,
            labelText: 'שם הלקוח',
            placeHolder: 'לדוגמא: א.ב. צינורות',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.required]
        },
        [FieldsCreateDocValue.RECIPIENT_ID]: {
            //name: FieldsCreateDocName.recipientId,
            value: FieldsCreateDocValue.RECIPIENT_ID,
            labelText: 'תעודת זהות או ח.פ',
            placeHolder: 'הקלד 9 ספרות',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.pattern(/^\d{9}$/)]
        },
        [FieldsCreateDocValue.RECIPIENT_PHONE]: {
            //name: FieldsCreateDocName.recipientPhone,
            value: FieldsCreateDocValue.RECIPIENT_PHONE,
            labelText: 'טלפון נייד',
            placeHolder: 'הקלד 10 ספרות',
            type: FormTypes.TELEPHONE,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
        },
        [FieldsCreateDocValue.RECIPIENT_EMAIL]: {
            //name: FieldsCreateDocName.recipientEmail,
            value: FieldsCreateDocValue.RECIPIENT_EMAIL,
            labelText: 'כתובת אימייל',
            placeHolder: 'name@gamil.com',
            type: FormTypes.EMAIL,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
        },
        [FieldsCreateDocValue.RECIPIENT_CITY]: {
            //name: FieldsCreateDocName.recipientCity,
            value: FieldsCreateDocValue.RECIPIENT_CITY,
            labelText: 'עיר',
            placeHolder: 'עיר',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.RECIPIENT_STREET]: {
            //name: FieldsCreateDocName.recipientStreet,
            value: FieldsCreateDocValue.RECIPIENT_STREET,
            labelText: 'רחוב',
            placeHolder: 'רחוב',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.RECIPIENT_HOME_NUMBER]: {
            //name: FieldsCreateDocName.recipientHomeNumber,
            value: FieldsCreateDocValue.RECIPIENT_HOME_NUMBER,
            labelText: 'מספר בית',
            placeHolder: 'מספר בית',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.RECIPIENT_POSTAL_CODE]: {
            //name: FieldsCreateDocName.recipientPostalCode,
            value: FieldsCreateDocValue.RECIPIENT_POSTAL_CODE,
            labelText: 'מיקוד',
            placeHolder: 'מיקוד',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.RECIPIENT_STATE]: {
            //name: FieldsCreateDocName.recipientState,
            value: FieldsCreateDocValue.RECIPIENT_STATE,
            labelText: 'מדינה',
            placeHolder: 'מדינה',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.RECIPIENT_STATE_CODE]: {
            //name: FieldsCreateDocName.recipientStateCode,
            value: FieldsCreateDocValue.RECIPIENT_STATE_CODE,
            labelText: 'קוד מדינה',
            placeHolder: 'קוד מדינה',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.SUM_AFTER_DIS_BEF_VAT]: {
            //name: FieldsCreateDocName.sumAfterDisBefVat,
            value: FieldsCreateDocValue.RECIPIENT_STATE_CODE,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.SUM_AFTER_DIS_WITH_VAT]: {
            //name: FieldsCreateDocName.sumAfterDisWithVat,
            value: FieldsCreateDocValue.SUM_AFTER_DIS_WITH_VAT,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.SUM_BEF_DIS_BEF_VAT]: {
            //name: FieldsCreateDocName.sumBefDisBefVat,
            value: FieldsCreateDocValue.SUM_BEF_DIS_BEF_VAT,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [FieldsCreateDocValue.VAT_SUM]: {
            //name: FieldsCreateDocName.vatSum,
            value: FieldsCreateDocValue.VAT_SUM,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        // Payment Details
        [fieldLineDocValue.SUM_BEF_VAT]: {
            //name: fieldLineDocName.sumBefVat,
            value: fieldLineDocValue.SUM_BEF_VAT,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.SUM]: {
            //name: fieldLineDocName.sumBefVat,
            value: fieldLineDocValue.SUM,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.min(0), Validators.required]
        },
        [fieldLineDocValue.LINE_DESCRIPTION]: {
            //name: fieldLineDocName.line_description,
            value: fieldLineDocValue.LINE_DESCRIPTION,
            labelText: '',
            placeHolder: '',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.required]
        },
        [fieldLineDocValue.UNIT_AMOUNT]: {
            //name: fieldLineDocName.unitAmount,
            value: fieldLineDocValue.UNIT_AMOUNT,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: 1,
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.VAT_RATE]: {
            //name: fieldLineDocName.vatRate,
            value: fieldLineDocValue.VAT_RATE,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: 18,
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.VAT_OPTIONS]: {
            //name: fieldLineDocName.vatOptions,
            value: fieldLineDocValue.VAT_OPTIONS,
            labelText: '',
            placeHolder: '',
            type: FormTypes.DDL,
            initialValue: '',
            enumValues: vatOptions,
            // enumValues: Object.entries(VatOptions).map(([name, value]) => ({ value, name })),
            editFormBasedOnValue: {},
            validators: [Validators.required]
        },
        [fieldLineDocValue.DISCOUNT]: {
            //name: fieldLineDocName.discount,
            value: fieldLineDocValue.DISCOUNT,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: 0,
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [Validators.min(0), Validators.required]
        },
        [fieldLineDocValue.LINE_NUMBER]: {
            //name: fieldLineDocName.lineNumber,
            value: fieldLineDocValue.LINE_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.UNIT_TYPE]: {
            //name: fieldLineDocName.unitType,
            value: fieldLineDocValue.UNIT_TYPE,
            labelText: '',
            placeHolder: '',
            type: FormTypes.DDL,
            initialValue: '',
            enumValues: Object.entries(UnitOfMeasure).map(([name, value]) => ({ value, name })),
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.PAYMENT_METHOD]: {
            //name: fieldLineDocName.paymentMethod,
            value: fieldLineDocValue.PAYMENT_METHOD,
            labelText: '',
            placeHolder: '',
            type: FormTypes.DDL,
            initialValue: '',
            enumValues: Object.entries(PaymentMethodValue).map(([name, value]) => ({ value, name })),
            editFormBasedOnValue: {
                TRANSFER: [fieldLineDocValue.BANK_NUMBER, fieldLineDocValue.BRANCH_NUMBER, fieldLineDocValue.ACCOUNT_NUMBER],
                CHECK: [fieldLineDocValue.BANK_NUMBER, fieldLineDocValue.BRANCH_NUMBER, fieldLineDocValue.ACCOUNT_NUMBER, fieldLineDocValue.CHECK_NUMBER, fieldLineDocValue.PAYMENT_CHECK_DATE],
                CREDIT_CARD: [fieldLineDocValue.CARD_COMPANY, fieldLineDocValue.CARD_4_NUMBER, fieldLineDocValue.CREDIT_CARD_NAME, fieldLineDocValue.CREDIT_TRANS_TYPE, fieldLineDocValue.CREDIT_PAY_NUMBER],
            },
            validators: [Validators.required]
        },
        [fieldLineDocValue.BANK_NUMBER]: {
            //name: fieldLineDocName.bankNumber,
            value: fieldLineDocValue.BANK_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.BRANCH_NUMBER]: {
            //name: fieldLineDocName.branchNumber,
            value: fieldLineDocValue.BRANCH_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.ACCOUNT_NUMBER]: {
            //name: fieldLineDocName.accountNumber,
            value: fieldLineDocValue.ACCOUNT_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.CHECK_NUMBER]: {
            //name: fieldLineDocName.checkNumber,
            value: fieldLineDocValue.CHECK_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.PAYMENT_CHECK_DATE]: {
            //name: fieldLineDocName.paymentCheckDate,
            value: fieldLineDocValue.PAYMENT_CHECK_DATE,
            labelText: '',
            placeHolder: '',
            type: FormTypes.DATE,
            initialValue: new Date(),
            enumValues: [],
            editFormBasedOnValue: {},
            validators: [],
        },
        [fieldLineDocValue.CARD_COMPANY]: {
            //name: fieldLineDocName.cardCompany,
            value: fieldLineDocValue.CARD_COMPANY,
            labelText: '',
            placeHolder: '',
            type: FormTypes.DDL,
            initialValue: '',
            enumValues: Object.entries(CardCompany).map(([name, value]) => ({ value, name })),
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.CARD_4_NUMBER]: {
            //name: fieldLineDocName.card4Number,
            value: fieldLineDocValue.CARD_4_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.CREDIT_CARD_NAME]: {
            //name: fieldLineDocName.creditCardName,
            value: fieldLineDocValue.CREDIT_CARD_NAME,
            labelText: '',
            placeHolder: '',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.CREDIT_TRANS_TYPE]: {
            //name: fieldLineDocName.creditTransType,
            value: fieldLineDocValue.CREDIT_TRANS_TYPE,
            labelText: '',
            placeHolder: '',
            type: FormTypes.DDL,
            initialValue: '',
            enumValues: Object.entries(CreditTransactionType).map(([name, value]) => ({ value, name })),
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.CREDIT_PAY_NUMBER]: {
            //name: fieldLineDocName.creditPayNumber,
            value: fieldLineDocValue.CREDIT_PAY_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.NUMBER,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.MANUFACTURER_NAME]: {
            //name: fieldLineDocName.manufacturerName,
            value: fieldLineDocValue.MANUFACTURER_NAME,
            labelText: '',
            placeHolder: '',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.PRODUCT_SERIAL_NUMBER]: {
            //name: fieldLineDocName.productSerialNumber,
            value: fieldLineDocValue.PRODUCT_SERIAL_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.INTERNAL_NUMBER]: {
            //name: fieldLineDocName.internalNumber,
            value: fieldLineDocValue.INTERNAL_NUMBER,
            labelText: '',
            placeHolder: '',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },
        [fieldLineDocValue.JOURNAL_ENTRY_MAIN_ID]: {
            //name: fieldLineDocName.journalEntryMainId,
            value: fieldLineDocValue.JOURNAL_ENTRY_MAIN_ID,
            labelText: '',
            placeHolder: '',
            type: FormTypes.TEXT,
            initialValue: '',
            enumValues: [],
            editFormBasedOnValue: {},
            validators: []
        },

    };

    readonly docCreateBuilderSectionsData: Partial<Record<SectionKeysEnum, ICreateDocSectionData>> = {
        'GeneralDetails': {
            key: 'GeneralDetails',
            baseFields: [FieldsCreateDocValue.DOC_TYPE, FieldsCreateDocValue.DOCUMENT_DATE, FieldsCreateDocValue.DOC_DESCRIPTION, FieldsCreateDocValue.DOC_VAT_RATE],
            expandable: true,
            expandedFields: [FieldsCreateDocValue.CURRENCY]
        },
        'UserDetails': {
            key: 'UserDetails',
            baseFields: [FieldsCreateDocValue.RECIPIENT_NAME, FieldsCreateDocValue.RECIPIENT_ID, FieldsCreateDocValue.RECIPIENT_PHONE, FieldsCreateDocValue.RECIPIENT_EMAIL],
            expandable: true,
            expandedFields: [FieldsCreateDocValue.RECIPIENT_CITY, FieldsCreateDocValue.RECIPIENT_STREET, FieldsCreateDocValue.RECIPIENT_HOME_NUMBER, FieldsCreateDocValue.RECIPIENT_POSTAL_CODE, FieldsCreateDocValue.RECIPIENT_STATE, FieldsCreateDocValue.RECIPIENT_STATE_CODE]
        },
        'LineDetails': {
            key: 'LineDetails',
            baseFields: [FieldsCreateDocValue.LINE_DESCRIPTION, FieldsCreateDocValue.SUM, FieldsCreateDocValue.DISCOUNT, FieldsCreateDocValue.UNIT_AMOUNT, FieldsCreateDocValue.VAT_OPTIONS],
            expandable: true,
            expandedFields: []
        },
        'ReceiptPaymentDetails': {
            key: 'ReceiptPaymentDetails',
            baseFields: [fieldLineDocValue.SUM, fieldLineDocValue.LINE_DESCRIPTION, fieldLineDocValue.VAT_OPTIONS, fieldLineDocValue.PAYMENT_METHOD],
            expandable: true,
            expandedFields: [fieldLineDocValue.DISCOUNT, fieldLineDocValue.UNIT_AMOUNT, fieldLineDocValue.VAT_RATE, fieldLineDocValue.UNIT_TYPE]
        },
        'TaxInvoicePaymentDetails': {
            key: 'TaxInvoicePaymentDetails',
            baseFields: [fieldLineDocValue.SUM, fieldLineDocValue.LINE_DESCRIPTION, fieldLineDocValue.VAT_OPTIONS, fieldLineDocValue.PAYMENT_METHOD],
            expandable: true,
            expandedFields: [fieldLineDocValue.DISCOUNT, fieldLineDocValue.UNIT_AMOUNT, fieldLineDocValue.VAT_RATE, fieldLineDocValue.UNIT_TYPE]
        },
    };

    buildDocCreateForm(sections: SectionKeysEnum[]): FormGroup {
        const form = new FormGroup({});

        sections.forEach((section) => {
            if (section === 'ReceiptPaymentDetails' || section === 'TaxInvoicePaymentDetails') { // TODO: update for all Payments details sections
                // Create a FormArray for payment details.
                const paymentFormArray = new FormArray([]);
                // Create an initial FormGroup for a payment detail entry.
                const paymentGroup = new FormGroup({});
                this.docCreateBuilderSectionsData[section].baseFields.forEach((field: string) => {
                    paymentGroup.addControl(field, new FormControl(this.docCreateBuilderData[field]?.initialValue, this.docCreateBuilderData[field]?.validators));
                });
                paymentFormArray.push(paymentGroup);
                // Add the FormArray to the main form.
                form.addControl(section, paymentFormArray);
            }
            else {
                // For other sections, create a FormGroup.
                const sectionForm = new FormGroup({});
                this.docCreateBuilderSectionsData[section].baseFields.forEach((field: string) => {
                    sectionForm.addControl(field, new FormControl(this.docCreateBuilderData[field]?.initialValue, this.docCreateBuilderData[field]?.validators));
                });
                form.addControl(section, sectionForm);
            }
        });

        return form;
    }

    addFormGroupToFormArray(formArray: FormArray, section: SectionKeysEnum) {
        const sectionForm = new FormGroup({});
        this.docCreateBuilderSectionsData[section].baseFields.forEach((field: string) => {
            sectionForm.addControl(field, new FormControl('', this.docCreateBuilderData[field]?.validators));
        });
        formArray.push(sectionForm);
    }

    removeFormGroupFromFormArray(formArray: FormArray, index: number) {
        formArray.removeAt(index);
    }

    addFormControlsByExpandedSection(sectionForm: FormGroup, section: SectionKeysEnum) {
        const expandedFields = this.docCreateBuilderSectionsData[section].expandedFields;
        expandedFields.forEach((field) => {
            sectionForm.addControl(field, new FormControl(
                this.docCreateBuilderData[field]?.initialValue, this.docCreateBuilderData[field].validators
            ));
        });

    }

    removeFormControlsByExpandedSection(sectionForm: FormGroup, section: SectionKeysEnum) {
        const expandedFields: string[] = this.docCreateBuilderSectionsData[section].expandedFields;
        Object.keys(sectionForm.controls).forEach((key) => {
            if (expandedFields.includes(key)) {
                sectionForm.removeControl(key);
            }
        });
    }

    addFormControlsByEnumValue(sectionForm: FormGroup, section: SectionKeysEnum, field: string, enumValue: string, isExpanded: boolean) {
        const enumValueFields: string[] = this.docCreateBuilderData[field]?.editFormBasedOnValue[enumValue];
        const desiredFields: string[] = [...this.docCreateBuilderSectionsData[section]?.baseFields];
        isExpanded ? desiredFields.push(...this.docCreateBuilderSectionsData[section]?.expandedFields) : null;

        Object.keys(sectionForm.controls).forEach((key) => {
            if (!desiredFields.includes(key)) {
                sectionForm.removeControl(key);
            }
        });

        enumValueFields?.forEach((field) => {
            sectionForm.addControl(field, new FormControl(
                '', this.docCreateBuilderData[field].validators
            ));
        });
    }

    getBaseFieldsBySection(section: SectionKeysEnum): IDocCreateFieldData[] {
        const sectionData = this.docCreateBuilderSectionsData[section];
        if (!sectionData) {
            return [];
        }

        const baseFields = sectionData.baseFields.map((field: string) => this.docCreateBuilderData[field]);

        return [...baseFields];
    }

    getExpandedFieldsBySection(section: SectionKeysEnum): IDocCreateFieldData[] {
        const sectionData = this.docCreateBuilderSectionsData[section];
        if (!sectionData) {
            return [];
        }

        const expandFields = sectionData.expandedFields.map((field: string) => this.docCreateBuilderData[field]);

        return [...expandFields];
    }

    getAllFieldsBySection(section: SectionKeysEnum): IDocCreateFieldData[] {
        // console.log("🚀 ~ DocCreateBuilderService ~ getAllFieldsBySection ~ section:", section)
        const sectionData = this.docCreateBuilderSectionsData[section];
        if (!sectionData) {
            return [];
        }
        const baseFields = sectionData.baseFields.map((field: string) => this.docCreateBuilderData[field]);
        const expandedFields = sectionData.expandable ? sectionData.expandedFields.map((field: string) => this.docCreateBuilderData[field]) : [];
        // console.log("🚀 ~ DocCreateBuilderService ~ getAllFieldsBySection ~ expandedFields:", expandedFields)

        return [...baseFields, ...expandedFields];
    }

    getFieldsBySectionAndEnumValue(section: SectionKeysEnum, field: string, enumValue: string, isExpanded: boolean): IDocCreateFieldData[] {
        console.log("🚀 ~ DocCreateBuilderService ~ getFieldsBySectionAndEnumValue ~ enumValue:", enumValue);
        const sectionData = this.docCreateBuilderSectionsData[section];
        if (!sectionData) {
            return [];
        }
        const baseFields = sectionData.baseFields.map((field: string) => this.docCreateBuilderData[field]);
        const enumValueFields = this.docCreateBuilderData[field]?.editFormBasedOnValue[enumValue]?.map((field: string) => this.docCreateBuilderData[field]);
        if (isExpanded) {
            const expandedFields = sectionData.expandable ? sectionData.expandedFields.map((field: string) => this.docCreateBuilderData[field]) : [];
            return enumValueFields ? [...baseFields, ...expandedFields, ...enumValueFields] : [...baseFields, ...expandedFields]; // For case there are no enumValueFields
        }
        return enumValueFields ? [...baseFields, ...enumValueFields] : [...baseFields];
    }

}