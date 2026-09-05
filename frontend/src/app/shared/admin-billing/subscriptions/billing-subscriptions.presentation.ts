import { ButtonColor } from 'src/app/components/button/button.enum';

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
