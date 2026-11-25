import type { GmailDurableRun } from './integrations.service';
import { EMAIL_LINK_REASONS } from './email-document-links.service';

export function countStates(counts:Record<string,number>|undefined, states:string[]):number {
  return states.reduce((sum,state)=>sum+(counts?.[state]||0),0);
}
export function emailRunNeedsHandling(run?:GmailDurableRun):boolean {
  return !!run && run.scan_state==='DONE' && !run.error_code && run.pull_state==='PARTIAL';
}
export function emailSyncErrorMessage(code: string | null | undefined, run?:GmailDurableRun): string {
  const messages: Record<string, string> = {
    EMAIL_RECONNECT_REQUIRED: 'ספק המייל דורש לאמת מחדש את החיבור. יש לחבר מחדש את החשבון.',
    EMAIL_ACCESS_DENIED: 'לא ניתן לגשת לתיבה עם ההרשאות הנוכחיות. יש לבדוק את הרשאות החיבור לפני ניסיון נוסף.',
    EMAIL_CONFIGURATION: 'משיכת המסמכים נעצרה עקב תקלה בהגדרת החיבור. יש לפנות לתמיכה.',
    EMAIL_RETRY_PENDING: 'אירעה תקלה זמנית במשיכת המסמכים. המערכת תנסה שוב אוטומטית.',
    EMAIL_RETRY_EXHAUSTED: 'משיכת המסמכים לא הושלמה לאחר כמה ניסיונות. מסמכים שכבר נקלטו נשמרו. אפשר להתחיל משיכה נוספת.',
  };
  if (messages[code||'']) return messages[code||''];
  if (messages[run?.error_code||'']) return messages[run?.error_code||''];
  if (emailRunNeedsHandling(run) || code==='Documents retained for manual handling; the mail cursor was not advanced.')
    return 'סריקת המיילים הסתיימה. חלק מהקישורים או הקבצים לא נקלטו ודורשים טיפול; המסמכים שנקלטו נשמרו. פירוט הסיבות מופיע בפרטי המשיכה.';
  if (run?.processing_state==='ATTENTION' && run.pull_state==='COMPLETE')
    return 'משיכת המסמכים הסתיימה. חלק מהמסמכים שנשמרו דורשים טיפול בעיבוד; ראו את הפירוט בפרטי המשיכה.';
  return 'משיכת המסמכים לא הושלמה, וסיבת התקלה אינה זמינה כרגע. מסמכים שכבר נקלטו נשמרו. אפשר לנסות שוב; אם התקלה חוזרת, יש לפנות לתמיכה.';
}
export function emailConnectionIssueMessage(code: string | null | undefined): string {
  return code === 'EMAIL_RECONNECT_REQUIRED' || code === 'EMAIL_ACCESS_DENIED' ? emailSyncErrorMessage(code)
    : 'לא ניתן לאמת כרגע את הגישה לתיבת המייל. אפשר לאמת מחדש את החיבור. מסמכים שכבר נקלטו נשמרו.';
}
export function emailRunPullLabel(run:GmailDurableRun):string {
  return emailRunNeedsHandling(run) ? 'הסריקה הסתיימה; חלק מהפריטים לא נקלטו' :
    ({COMPLETE:'הושלם',PARTIAL:'המשיכה לא הושלמה',RUNNING:'בתהליך',RETRY:'ממתין לניסיון נוסף'} as Record<string,string>)[run.pull_state]||run.pull_state;
}
export function emailRunIssueLines(run:GmailDurableRun):{label:string;count:number}[] {
  const groups=new Map<string,number>();
  for(const issue of run.issues||[]) {
    let label:string;
    if(issue.state==='RETRY') label=issue.scope==='message'?'קריאת הודעות ממתינה לניסיון אוטומטי נוסף':'קליטת פריטים ממתינה לניסיון אוטומטי נוסף';
    else if(issue.scope==='link') label=EMAIL_LINK_REASONS[issue.code||'']||'הורדת הקישור לא הושלמה; הסיבה אינה ידועה';
    else label=issue.scope==='message'?'הודעות שלא ניתן היה לקרוא; הסריקה שלהן לא הושלמה':'קבצים מצורפים שלא ניתן היה לקלוט';
    groups.set(label,(groups.get(label)||0)+issue.count);
  }
  if(!run.issues) {
    const blocked=countStates(run.attachments,['BLOCKED'])+countStates(run.messages,['BLOCKED']);
    if(blocked) groups.set('פריטים שלא נקלטו; פירוט הסיבות אינו זמין בריצה הישנה',blocked);
    const retry=countStates(run.attachments,['RETRY'])+countStates(run.messages,['RETRY']);
    if(retry)groups.set('פריטים הממתינים לניסיון אוטומטי נוסף',retry);
  }
  const states:Record<string,string>={
    PASSWORD_REQUIRED:'מסמכים מוגנים בסיסמה — יש להעלות עותק פתוח מרשימת המסמכים',
    AWAITING_APPROVAL:'מסמכים שממתינים לבדיקה ולאישור ברשימת המסמכים',
    BLOCKED_INVALID:'מסמכים שלא ניתן לעבד כקובץ תקין',
    BLOCKED_LIMIT:'מסמכים שחורגים ממגבלות העיבוד',
    WORK_BLOCKED:'מסמכים שעיבודם דורש טיפול — ראו את הסיבה ברשימת המסמכים',
    DELETE_BLOCKED:'מסמכים שמחיקתם חסומה ונדרש טיפול',
    DELETE_UNCONFIRMED:'מסמכים שמחיקתם טרם אומתה',
    DELETE_RETRY:'מחיקות הממתינות לניסיון אוטומטי נוסף',
  };
  for(const [state,label] of Object.entries(states)) if(run.documents?.[state])groups.set(label,run.documents[state]);
  return [...groups].map(([label,count])=>({label,count}));
}
