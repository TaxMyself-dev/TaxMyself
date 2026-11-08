/** Fixed, account-independent explanations. Never include account or business data. */
export const intakeRejections = {
  REJECTED_ACCOUNT_AMBIGUOUS:
    'המסמך לא נשמר: מספר הטלפון משויך ליותר מחשבון אחד ולכן לא ניתן לזהות לאיזה חשבון להעלות אותו. יש לפנות לתמיכה להסדרת שיוך המספר.',
  REJECTED_ACCOUNT_MISSING:
    'המסמך לא נשמר: לא נמצא חשבון הרשום עם מספר הטלפון שממנו שלחת. יש לבדוק את המספר בחשבון או לפנות לתמיכה.',
  REJECTED_ACCOUNT_CHANGED:
    'המסמך לא נשמר: שיוך מספר הטלפון לחשבון השתנה במהלך הטיפול. יש לפנות לתמיכה ולבדוק את מצב המסמך לפני שליחה חוזרת.',
  REJECTED_MEDIA_TYPE:
    'הקובץ לא נשמר: סוג ההודעה אינו נתמך להעלאת מסמכים. אפשר לשלוח PDF או תמונת JPG/PNG.',
  REJECTED_BUSINESS_SELECTION:
    'בחירת העסק לא התקבלה ולכן לא בוצעה העלאה בעקבות הבחירה הזאת. יש לבחור מתוך השאלה שנשלחה עבור המסמך או לפנות לתמיכה.',
} as const;

export type IntakeRejection = keyof typeof intakeRejections;
export function isIntakeRejection(status: string): status is IntakeRejection {
  return Object.prototype.hasOwnProperty.call(intakeRejections, status);
}
