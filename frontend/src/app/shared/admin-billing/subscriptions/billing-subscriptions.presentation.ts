import { ButtonColor } from 'src/app/components/button/button.enum';
import {
  AdminBillingExceptionAction,
  AdminBillingExceptionFailureCategory,
  AdminUnresolvedAttemptStatus,
  AdminUnresolvedBillingAttempt,
} from 'src/app/services/admin-billing.service';

export interface AdminPlanIdentity {
  name: string | null;
  slug: string | null;
}

const REFERRAL_PLAN_LABELS: Record<string, string> = {
  'referral-basic': 'הפניית רואה חשבון — בסיסי',
  'referral-open-banking': 'הפניית רואה חשבון — כולל בנקאות פתוחה',
};

/** Disambiguates only the two canonical accountant-referral plan identities. */
export function adminPlanDisplayName(plan: AdminPlanIdentity): string | null {
  return plan.slug ? REFERRAL_PLAN_LABELS[plan.slug] ?? plan.name : plan.name;
}

/** Design-system configuration used by the subscription drawer save action. */
export const ADMIN_SUBSCRIPTION_SAVE_BUTTON_COLOR = ButtonColor.BLACK;

// ─── Billing exceptions (unresolved UNKNOWN / MANUAL_REVIEW attempts) ─────────

export const BILLING_EXCEPTION_STATUS_LABELS: Record<AdminUnresolvedAttemptStatus, string> = {
  CREATED: 'פתיחת עמוד התשלום טרם הושלמה',
  AWAITING_CUSTOMER: 'ממתין לתשלום הלקוח',
  PROCESSING: 'תשלום בעיבוד',
  CAPTURED: 'נגבה — השלמה מקומית ממתינה',
  COMPLETED: 'התשלום הושלם והחובות נסגרו',
  DECLINED: 'התשלום נדחה — ניתן לנסות שוב',
  CANCELED: 'הניסיון נסגר ללא חיוב',
  EXPIRED: 'ניסיון התשלום פג',
  UNKNOWN: 'תוצאת החיוב עדיין בבירור',
  MANUAL_REVIEW: 'נדרשת בדיקה ידנית',
};

export const BILLING_CHARGE_MODE_LABELS: Record<AdminUnresolvedBillingAttempt['chargeMode'], string> = {
  LOW_PROFILE_HOSTED: 'עמוד תשלום מאובטח (Hosted Checkout)',
  TOKEN_TRANSACTION: 'חידוש בכרטיס שמור (Token)',
};

export const BILLING_FAILURE_CATEGORY_LABELS: Record<AdminBillingExceptionFailureCategory, string> = {
  HOSTED_CREATION_FAILED: 'פתיחת עמוד התשלום נכשלה — יש לבדוק אם נוצר עמוד בקארדקום',
  POST_CAPTURE_PENDING: 'התשלום נגבה — יש להשלים את החשבונית וסגירת החובות',
  CHECKOUT_NOT_FINISHED: 'עמוד התשלום טרם הסתיים — יש לברר את מצב העסקה לפני שחרור',
  MISSING_OR_EXPIRED_PAYMENT_METHOD: 'אמצעי תשלום חסר או שפג תוקפו — הלקוח צריך לעדכן אמצעי תשלום',
  TOKEN_DECRYPTION_FAILED: 'כשל בפענוח אמצעי התשלום השמור — נדרשת בדיקה פנימית',
  RECONCILIATION_EXHAUSTED: 'בדיקות ההתאמה מול הספק מוצו — נדרשת בדיקה ידנית',
  PROVIDER_OUTCOME_UNKNOWN: 'תוצאת החיוב אצל הספק עדיין נבדקת',
};

export const BILLING_ACTION_MESSAGES: Record<AdminBillingExceptionAction, string> = {
  CUSTOMER_PAYMENT_METHOD: 'נדרשת פעולת לקוח: עדכון אמצעי תשלום.',
  INTERNAL_REVIEW: 'בדיקה פנימית של המערכת — אין צורך בפעולה מצד הלקוח.',
  AUTOMATIC_CHECK: 'המערכת ממשיכה לבדוק מול הספק באופן אוטומטי — אין צורך בפעולה כרגע.',
};

/** Tooltip for the compact table indicator: unresolved count plus the most severe status. */
export function unresolvedAttemptsTooltip(
  count: number,
  mostSevere: AdminUnresolvedAttemptStatus | null,
): string {
  const severe = mostSevere ? BILLING_EXCEPTION_STATUS_LABELS[mostSevere] : '';
  const noun = count === 1 ? 'ניסיון חיוב לא סגור אחד' : `${count} ניסיונות חיוב לא סגורים`;
  return severe ? `${noun} — ${severe}` : noun;
}

export function formatBillingAmount(agorot: number, currency: string): string {
  const amount = (agorot / 100).toFixed(2);
  return currency === 'ILS' ? `₪${amount}` : `${amount} ${currency}`;
}
