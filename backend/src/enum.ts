export enum UserRole {
  REGULAR = 'REGULAR',
  ADMIN = 'ADMIN',
  ACCOUNTANT = 'ACCOUNTANT',
}

export enum PayStatus {
  FREE = 'FREE',
  PAID = 'PAID',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  CANCELED = 'CANCELED'
}

export enum ModuleName {
  INVOICES = 1,
  OPEN_BANKING = 2,
  ACCOUNTANT = 3,
  FINANCIAL_ADVISOR = 4
}

export enum BusinessType {
  EXEMPT = 'EXEMPT',
  LICENSED = 'LICENSED',
  COMPANY = 'COMPANY'
}

export enum FamilyStatus {
  MARRIED = 'MARRIED',
  SINGLE = 'SINGLE',
  DIVORCED = 'DIVORCED'
}

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE'
}

export enum EmploymentType {
  SELF_EMPLOYED = 'SELF_EMPLOYED',
  BOTH = 'BOTH',
  EMPLOYEE = 'EMPLOYEE'
}

export enum VATReportingType {
  NOT_REQUIRED = 'NOT_REQUIRED',
  SINGLE_MONTH_REPORT = 'SINGLE_MONTH_REPORT',
  DUAL_MONTH_REPORT = 'DUAL_MONTH_REPORT'
}

export const VAT_RATES: Record<number, number> = {
  2023: 0.17,
  2024: 0.17,
  2025: 0.18,
};

export enum TaxReportingType {
  NOT_REQUIRED = 'NOT_REQUIRED',
  SINGLE_MONTH_REPORT = 'SINGLE_MONTH_REPORT',
  DUAL_MONTH_REPORT = 'DUAL_MONTH_REPORT'
}

// Enum for single month report
export enum SingleMonthReport {
  JANUARY = "1/2024",
  FEBRUARY = "2/2024",
  MARCH = "3/2024",
  APRIL = "4/2024",
  MAY = "5/2024",
  JUNE = "6/2024",
  JULY = "7/2024",
  AUGUST = "8/2024",
  SEPTEMBER = "9/2024",
  OCTOBER = "10/2024",
  NOVEMBER = "11/2024",
  DECEMBER = "12/2024"
}

// Enum for dual month report
export enum DualMonthReport {
  JAN_FEB = "1-2/2024",
  MAR_APR = "3-4/2024",
  MAY_JUN = "5-6/2024",
  JUL_AUG = "7-8/2024",
  SEP_OCT = "9-10/2024",
  NOV_DEC = "11-12/2024"
}

// Enum for dual month report
export enum SourceType {
  CREDIT_CARD = 'CREDIT_CARD',
  BANK_ACCOUNT = 'BANK_ACCOUNT'
}

export enum DocumentType {
  GENERAL = 'GENERAL', // כללי
  RECEIPT = 'RECEIPT', // קבלה
  TAX_INVOICE = 'TAX_INVOICE', // חשבונית מס
  TAX_INVOICE_RECEIPT = 'TAX_INVOICE_RECEIPT', // חשבונית מס קבלה
  TRANSACTION_INVOICE = 'TRANSACTION_INVOICE', // חשבונית עסקה
  CREDIT_INVOICE = 'CREDIT_INVOICE', // חשבונית זיכוי
  JOURNAL_ENTRY = 'JOURNAL_ENTRY', //  פקודת יומן
}

export enum JournalReferenceType {
  RECEIPT = 'RECEIPT',
  TAX_INVOICE = 'TAX_INVOICE',
  TAX_INVOICE_RECEIPT = 'TAX_INVOICE_RECEIPT',
  TRANSACTION_INVOICE = 'TRANSACTION_INVOICE',
  CREDIT_INVOICE = 'CREDIT_INVOICE',
  EXPENSE = 'EXPENSE',
  PAYMENT = 'PAYMENT',
  MANUAL = 'MANUAL',
  VAT_PAYMENT = 'VAT_PAYMENT',
  ADJUSTMENT = 'ADJUSTMENT'
}

export const UniformFileTypeCodeMap: Partial<Record<DocumentType | JournalReferenceType, number>> = {

  // DocumentType mappings
  [DocumentType.TRANSACTION_INVOICE as string]: 300,
  [DocumentType.TAX_INVOICE as string]: 305,
  [DocumentType.TAX_INVOICE_RECEIPT as string]: 320,
  [DocumentType.CREDIT_INVOICE as string]: 330,
  [DocumentType.RECEIPT as string]: 400,

  // JournalReferenceType mappings (some overlap, some unique)
  [JournalReferenceType.RECEIPT as string]: 400,
  [JournalReferenceType.TAX_INVOICE as string]: 305,
  [JournalReferenceType.TAX_INVOICE_RECEIPT as string]: 320,
  [JournalReferenceType.TRANSACTION_INVOICE as string]: 300,
  [JournalReferenceType.CREDIT_INVOICE as string]: 330,
  [JournalReferenceType.EXPENSE as string]: 410,
  
};

export enum PaymentMethodType {
  CASH = 1,            // מזומן
  CHECK = 2,           // המחאה
  CREDIT_CARD = 3,     // אשראי
  BANK_TRANSFER = 4,   // העברה בנקאית
  GIFT_CARD = 5,       // תווי קנייה
  BILL_EXCHANGE = 6,   // תלוש חלפה
  VOUCHER = 7,         // שטר
  STANDING_ORDER = 8,  // הוראת קבע
  OTHER = 9            // אחר
}

export enum Currency {
  ILS = 'ILS',
  USD = 'USD',
  EUR = 'EUR',
}

export enum UnitOfMeasure {
  UNIT = 'UNIT',
  WORK_HOUR = 'WORK_HOUR',
  LITER = 'LITER',
  KILOGRAM = 'KILOGRAM'
}

export enum VatOptions {
  INCLUDE = 1,
  EXCLUDE = 2,
  WITHOUT = 3
}

export enum CreditTransactionType {
  REGULAR = 1,   // רגיל
  INSTALLMENTS = 2, // תשלומים
  CREDIT = 3, // קרדיט
  DEFERRED_CHARGE = 4, // חיוב נדחה
  OTHER = 5 // אחר
}

export enum CardCompany {
  ISRACARD = 1,
  CAL = 2,
  DINERS = 3,
  AMERICAN_EXPRESS = 4,
  VISA = 5,
  LEUMI_CARD = 6,
  MASTERCARD = 7,
  OTHER = 8
}

export enum ExpenseNecessity {
  MANDATORY = 'MANDATORY', // הכרחי (למשל: חשבונות, מיסים)
  IMPORTANT = 'IMPORTANT', // חשוב אבל אפשר להסתדר בלעדיו
  OPTIONAL = 'OPTIONAL', // רשות (למשל: בילויים, מותרות)
}

export const FIELD_MAP = {
  A000: [
    { field: "f_1000", length: 4, description: "קוד רשומה" },
    { field: "f_1001", length: 5, description: "שימוש עתידי" },
    { field: "f_1002", length: 15, description: "BKMVDATA סך רשומות בקובץ" },
    { field: "f_1003", length: 9, description: "מספר עסק מורשה" },
    { field: "f_1004", length: 15, description: "מזהה ראשי" },
    { field: "f_1005", length: 8, description: "קבוע מערכת" },
    { field: "f_1006", length: 8, description: "מספר רישום התוכנה" },
    { field: "f_1007", length: 20, description: "שם התוכנה" },
    { field: "f_1008", length: 20, description: "מהדורת התוכנה" },
    { field: "f_1009", length: 9, description: "מספר עוסק של יצרן התוכנה" },
    { field: "f_1010", length: 20, description: "שם יצרן התוכנה" },
    { field: "f_1011", length: 1, description: "סוג התוכנה" },
    { field: "f_1012", length: 50, description: "נתיב מיקום שמירת הקבצים" },
    { field: "f_1013", length: 1, description: "סוג הנהלת חשבונות" },
    { field: "f_1014", length: 1, description: "איזון חשבונאי נדרש" },
    { field: "f_1015", length: 9, description: "מספר חברה ברשם החברות" },
    { field: "f_1016", length: 9, description: "מספר תיק ניכויים" },
    { field: "f_1017", length: 10, description: "שימוש עתידי" },
    { field: "f_1018", length: 50, description: "שם העסק" },
    { field: "f_1019", length: 50, description: "מען העסק - רחוב" },
    { field: "f_1020", length: 10, description: "מען העסק - בית" },
    { field: "f_1021", length: 30, description: "מען העסק - עיר" },
    { field: "f_1022", length: 8, description: "מען העסק - מיקוד" },
    { field: "f_1023", length: 4, description: "שנת המס" },
    { field: "f_1024", length: 8, description: "תאריך חיתוך התחלה" },
    { field: "f_1025", length: 8, description: "תאריך חיתוך סוף" },
    { field: "f_1026", length: 8, description: "תאריך תחילת התהליך" },
    { field: "f_1027", length: 4, description: "שעת התחלת התהליך" },
    { field: "f_1028", length: 1, description: "קוד שפה" },
    { field: "f_1029", length: 1, description: "סט תווים" },
    { field: "f_1030", length: 20, description: "שם תוכנת הכיווץ" },
    { field: "f_1032", length: 3, description: "מטבע מוביל" },
    { field: "f_1034", length: 1, description: "מידע על סניפים נוספים" },
    { field: "f_1035", length: 46, description: "שימוש עתידי" }
  ],
  A100: [
    { field: "f_1100", length: 4, description: "קוד רשומה" },
    { field: "f_1101", length: 9, description: "מספר רשומה בקובץ" },
    { field: "f_1102", length: 9, description: "מספר עוסק מורשה" },
    { field: "f_1103", length: 15, description: "מזהה ראשי" },
    { field: "f_1104", length: 8, description: "קבוע מערכת" },
    { field: "f_1105", length: 50, description: "שימוש עתידי" }
  ],
  Z900: [
    { field: "f_1150", length: 4, description: "קוד רשומה" },
    { field: "f_1151", length: 9, description: "מספר רשומה בקובץ" },
    { field: "f_1152", length: 9, description: "מספר עוסק מורשה" },
    { field: "f_1153", length: 15, description: "מזהה ראשי" },
    { field: "f_1154", length: 8, description: "קבוע מערכת" },
    { field: "f_1155", length: 15, description: "סך רשומות כולל בקובץ" },
    { field: "f_1156", length: 50, description: "שימוש עתידי" }
  ],
  C100: [
    { field: "f_1200", length: 4, description: "קוד רשומה" },
    { field: "f_1201", length: 9, description: "מספר רשומה בקובץ" },
    { field: "f_1202", length: 9, description: "מספר עוסק מורשה" },
    { field: "f_1203", length: 3, description: "סוג מסמך" },
    { field: "f_1204", length: 20, description: "מספר מסמך" },
    { field: "f_1205", length: 8, description: "תאריך הפקת מסמך" },
    { field: "f_1206", length: 4, description: "שעת הפקת מסמך" },
    { field: "f_1207", length: 50, description: "שם מקבל המסמך" },
    { field: "f_1208", length: 50, description: "כתובת מקבל המסמך - רחוב" },
    { field: "f_1209", length: 10, description: "כתובת מקבל המסמך - מספר בית" },
    { field: "f_1210", length: 30, description: "כתובת מקבל המסמך - עיר" },
    { field: "f_1211", length: 8, description: "כתובת מקבל המסמך - מיקוד" },
    { field: "f_1212", length: 30, description: "כתובת מקבל המסמך - מדינה" },
    { field: "f_1213", length: 2, description: "קוד מדינה" },
    { field: "f_1214", length: 15, description: "טלפון מקבל המסמך" },
    { field: "f_1215", length: 9, description: "ח.פ / ת.ז של מקבל המסמך" },
    { field: "f_1216", length: 8, description: "תאריך ערך" },
    { field: "f_1217", length: 15, description: "סכום המסמך במטבע חוץ" },
    { field: "f_1218", length: 3, description: "קוד מטבע" },
    { field: "f_1219", length: 15, description: "סכום לפני הנחה ולפני מע״מ" },
    { field: "f_1220", length: 15, description: "סכום הנחה במסמך" },
    { field: "f_1221", length: 15, description: "סכום לאחר הנחה ולפני מע״מ" },
    { field: "f_1222", length: 15, description: "סכום מע״מ במסמך" },
    { field: "f_1223", length: 15, description: "סכום כולל לאחר הנחה ומע״מ" },
    { field: "f_1224", length: 12, description: "סכום ניכוי במקור" },
    { field: "f_1225", length: 15, description: "מפתח לקוח אצל המוכר" },
    { field: "f_1226", length: 10, description: "שדה התאמה" },
    { field: "f_1228", length: 1, description: "שדה התאמה - האם המסמך מבוטל" },
    { field: "f_1230", length: 8, description: "תאריך מסמך" },
    { field: "f_1231", length: 7, description: "קוד סניף בו הופק המסמך" },
    { field: "f_1233", length: 9, description: "שם המשתמש שהפיק את המסמך" },
    { field: "f_1234", length: 7, description: "מספר מסמך כללי" },
    { field: "f_1235", length: 13, description: "שדה לשימוש עתידי" }
  ],
  D110: [
    { field: "f_1250", length: 4, description: "קוד רשומה" },
    { field: "f_1251", length: 9, description: "מספר רשומה בקובץ" },
    { field: "f_1252", length: 9, description: "מספר עוסק מורשה" },
    { field: "f_1253", length: 3, description: "סוג מסמך" },
    { field: "f_1254", length: 20, description: "מספר מסמך" },
    { field: "f_1255", length: 4, description: "מספר שורה במסמך" },
    { field: "f_1256", length: 3, description: "סוג מסמך מקור" },
    { field: "f_1257", length: 20, description: "מספר מסמך מקור" },
    { field: "f_1258", length: 1, description: "סוג עסקה" },
    { field: "f_1259", length: 20, description: "מספר פנימי של המוצר והטובין על ידי היצרן" },
    { field: "f_1260", length: 30, description: "תיאור הפריט" },
    { field: "f_1261", length: 50, description: "שם היצרן של המוצר" },
    { field: "f_1262", length: 30, description: "מספר סידורי של המוצר" },
    { field: "f_1263", length: 20, description: "יחידת מדידה" },
    { field: "f_1264", length: 12, description: "כמות ביחידות מדידה" },
    { field: "f_1265", length: 12, description: "מחיר ליחידה לפני מע״מ" },
    { field: "f_1266", length: 12, description: "סכום הנחה בשח" },
    { field: "f_1267", length: 12, description: "סכום לפני מע״מ" },
    { field: "f_1268", length: 2, description: "שיעור מע״מ" },
    { field: "f_1270", length: 7, description: "קוד סניף" },
    { field: "f_1272", length: 8, description: "תאריך מסמך" },
    { field: "f_1273", length: 7, description: "מספר מסמך כללי" },
    { field: "f_1274", length: 7, description: "קוד סניף מסמך מקור" },
    { field: "f_1275", length: 21, description: "שדה לשימוש עתידי" }
  ],
  D120: [
      { field: "f_1300", length: 4, description: "קוד רשומה" },
      { field: "f_1301", length: 9, description: "מספר רשומה בקובץ" },
      { field: "f_1302", length: 9, description: "מספר עוסק מורשה" },
      { field: "f_1303", length: 3, description: "סוג מסמך" },
      { field: "f_1304", length: 20, description: "מספר מסמך" },
      { field: "f_1305", length: 4, description: "מספר שורה במסמך" },
      { field: "f_1306", length: 1, description: "סוג אמצעי התשלום" },
      { field: "f_1307", length: 10, description: "מספר הבנק" },
      { field: "f_1308", length: 10, description: "מספר הסניף" },
      { field: "f_1309", length: 15, description: "מספר חשבון" },
      { field: "f_1310", length: 10, description: "מספר המחאה" },
      { field: "f_1311", length: 8, description: "תאריך הפירעון של ההמחאה" },
      { field: "f_1312", length: 12, description: "סכום השורה" },
      { field: "f_1313", length: 1, description: "קוד החברה הסולקת" },
      { field: "f_1314", length: 20, description: "שם כרטיס הסולק" },
      { field: "f_1315", length: 1, description: "סוג עסקת האשראי" },
      { field: "f_1320", length: 7, description: "קוד סניף מסמך" },
      { field: "f_1322", length: 8, description: "תאריך המסמך" },
      { field: "f_1323", length: 7, description: "מספר מסמך כללי" },
      { field: "f_1324", length: 60, description: "שדה לשימוש עתידי" }
    ],
    B100: [
      { field: "f_1350", length: 4, description: "קוד רשומה" },
      { field: "f_1351", length: 9, description: "מספר רשומה בקובץ" },
      { field: "f_1352", length: 9, description: "מספר עוסק מורשה" },
      { field: "f_1353", length: 10, description: "מספר התאמה" },
      { field: "f_1354", length: 9, description: "סכום ההכנסה" },
      { field: "f_1355", length: 9, description: "סכום ההוצאה" },
      { field: "f_1356", length: 4, description: "סוג מסמך ראשי" },
      { field: "f_1357", length: 20, description: "תיאור המסמך" },
      { field: "f_1358", length: 9, description: "מספר מסמך ראשי" },
      { field: "f_1359", length: 9, description: "סכום המסמך" },
      { field: "f_1360", length: 50, description: "פרטים" },
      { field: "f_1361", length: 8, description: "תאריך" },
      { field: "f_1362", length: 8, description: "תאריך ערך" },
      { field: "f_1363", length: 15, description: "חשבון בנק ראשי" },
      { field: "f_1364", length: 15, description: "חשבון משני" },
      { field: "f_1365", length: 15, description: "תיאור חשבון משני" },
      { field: "f_1366", length: 4, description: "קוד מסמך משני" },
      { field: "f_1367", length: 15, description: "מספר מסמך משני" },
      { field: "f_1368", length: 9, description: "שדה מסמך משני" },
      { field: "f_1369", length: 12, description: "מספר תשלום מסמך משני" },
      { field: "f_1370", length: 12, description: "סכום תשלום מסמך משני" },
      { field: "f_1371", length: 9, description: "שדה התאמה 1" },
      { field: "f_1372", length: 10, description: "שדה התאמה 2" },
      { field: "f_1374", length: 4, description: "שדה קוד פנימי" },
      { field: "f_1375", length: 8, description: "תאריך המסמך" },
      { field: "f_1376", length: 7, description: "מספר מסמך כללי" },
      { field: "f_1377", length: 25, description: "שדה לשימוש עתידי" }
    ],
    B110: [
      { field: "f_1400", length: 4, description: "קוד רשומה" },
      { field: "f_1401", length: 9, description: "מספר רשומה בקובץ" },
      { field: "f_1402", length: 9, description: "מספר עוסק מורשה" },
      { field: "f_1403", length: 15, description: "תיאור השדה חד חד ערכי" },
      { field: "f_1404", length: 50, description: "שם החשבון" },
      { field: "f_1405", length: 30, description: "תיאור קוד מסמך גוביינא" },
      { field: "f_1406", length: 30, description: "תיאור קוד מסמך ספק / מיקוד" },
      { field: "f_1407", length: 30, description: "תיאור קוד מסמך ספק / מדינה" },
      { field: "f_1413", length: 15, description: "חשבון מרכזי" },
      { field: "f_1414", length: 15, description: "יתרת החשבון בתאריך התחלתי" },
      { field: "f_1415", length: 15, description: "סה\"כ חובה" },
      { field: "f_1416", length: 15, description: "סה\"כ זכות" },
      { field: "f_1417", length: 9, description: "קוד רווח והפסד" },
      { field: "f_1418", length: 4, description: "שדה בטל" },
      { field: "f_1420", length: 7, description: "גמ\"ח סניפי" },
      { field: "f_1421", length: 15, description: "יתרת החשבון בתאריך חתך" },
      { field: "f_1422", length: 3, description: "מספר מסמך קוד מסמך בספרי הספק / הלקוח" },
      { field: "f_1423", length: 16, description: "שדה לשימוש עתידי" }
    ],
    M100: [
      { field: "f_1450", length: 4, description: "קוד רשומה" },
      { field: "f_1451", length: 9, description: "מספר רשומה בקובץ" },
      { field: "f_1452", length: 9, description: "מספר עוסק מורשה" },
      { field: "f_1453", length: 20, description: "מספר מסמך פנימי" },
      { field: "f_1454", length: 20, description: "מספר מסמך ספק / חו" },
      { field: "f_1455", length: 20, description: "מספר מסמך פנימי נוסף" },
      { field: "f_1456", length: 10, description: "קוד מטבע" },
      { field: "f_1457", length: 30, description: "תיאור קוד מטבע" },
      { field: "f_1458", length: 20, description: "תיאור יחידה מיוחדת" },
      { field: "f_1460", length: 9, description: "נתוני הפריט בתקופת החתך" },
      { field: "f_1461", length: 9, description: "סה\"כ הכנסות" },
      { field: "f_1462", length: 12, description: "סה\"כ הכנסות לאחר ניכוי" },
      { field: "f_1463", length: 10, description: "סה\"כ הוצאות" },
      { field: "f_1464", length: 10, description: "סה\"כ הוצאות לאחר ניכוי" },
      { field: "f_1465", length: 50, description: "שדה לשימוש עתידי" }
    ]
};


