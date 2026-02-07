export const SupplierType = {
    name: 'שם הספק',
    category: 'קטגוריה',
    supplierID: 'מספר ספק',
    subCategory: 'תת קטגוריה',
    taxPercent: 'אחוז מס',
    vatPercent: 'אחוז מע"מ',
    isEquipment: 'האם זה ציוד',
    reductionPercent: 'אחוז פחת',
} as const;

export type SupplierKeys = keyof typeof SupplierType;
export type SupplierValues = typeof SupplierType[SupplierKeys];

export const ClientType = {
    id: 'ת.ז. / ח.פ.',
    name: 'שם הלקוח',
    phone: 'טלפון',
    email: 'אימייל',
    address: 'כתובת',
} as const;

export type ClientKeys = keyof typeof ClientType;
export type ClientValues = typeof ClientType[ClientKeys];
