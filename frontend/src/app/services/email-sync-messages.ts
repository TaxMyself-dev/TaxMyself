export function emailSyncErrorMessage(code: string | null | undefined): string {
  const messages: Record<string, string> = {
    EMAIL_RECONNECT_REQUIRED: 'ספק המייל דורש לאמת מחדש את החיבור. יש לחבר מחדש את החשבון.',
    EMAIL_ACCESS_DENIED: 'לא ניתן לגשת לתיבה עם ההרשאות הנוכחיות. יש לבדוק את הרשאות החיבור לפני ניסיון נוסף.',
    EMAIL_CONFIGURATION: 'משיכת המסמכים נעצרה עקב תקלה בהגדרת החיבור. יש לפנות לתמיכה.',
    EMAIL_RETRY_PENDING: 'אירעה תקלה זמנית במשיכת המסמכים. המערכת תנסה שוב אוטומטית.',
    EMAIL_RETRY_EXHAUSTED: 'משיכת המסמכים נעצרה לאחר כמה ניסיונות. ניתן לנסות שוב; מסמכים שכבר נקלטו נשמרו.',
  };
  return messages[code || ''] || 'משיכת המסמכים נעצרה. ניתן לנסות שוב; מסמכים שכבר נקלטו נשמרו.';
}
export function emailConnectionIssueMessage(code: string | null | undefined): string {
  return code === 'EMAIL_RECONNECT_REQUIRED' ? emailSyncErrorMessage(code)
    : 'לא ניתן לאמת כרגע את הגישה לתיבת המייל. אפשר לאמת מחדש את החיבור. מסמכים שכבר נקלטו נשמרו.';
}
