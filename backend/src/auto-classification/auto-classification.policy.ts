import { createHash } from 'crypto';
import { FIELDS, ProfileRow } from '../agent-onboarding/onboarding.domain';
import { AgentHarnessUser } from '../agent-harness/agent-harness.service';
import { ForbiddenException } from '@nestjs/common';

export function assertSelf(user: AgentHarnessUser) {
  if (
    !user.firebaseId ||
    user.actorFirebaseId !== user.firebaseId ||
    user.isDelegatedAccess ||
    user.isAdminImpersonation
  )
    throw new ForbiddenException('רק בעל החשבון רשאי לנהל את הסוכן שלו');
}
// Onboarding's missingFields means unanswered, including explicit skips as answered.
// Automation additionally requires actual information, never an unknown/skipped answer.
export function automationMissing(person?: ProfileRow, business?: ProfileRow) {
  return FIELDS.filter((f) => {
    const row = f.scope === 'person' ? person : business;
    const state = row?.field_states?.[f.key];
    return (
      state !== 'not_applicable' &&
      !(
        state === 'known' &&
        typeof row?.[f.key] === 'string' &&
        String(row[f.key]).trim()
      )
    );
  }).map((f) => ({ key: f.key, label: f.label }));
}
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export interface ClassificationDecision {
  kind: 'rule' | 'clarify';
  subCategoryId: number | null;
  reason: string;
  question: string | null;
}
export function decision(
  value: unknown,
  allowed: number[],
): ClassificationDecision {
  const d = value as ClassificationDecision;
  if (
    !d ||
    !['rule', 'clarify'].includes(d.kind) ||
    typeof d.reason !== 'string' ||
    !d.reason.trim() ||
    d.reason.length > 1500
  )
    throw new Error('INVALID_DECISION');
  if (
    d.kind === 'rule'
      ? !Number.isInteger(d.subCategoryId) ||
        !allowed.includes(d.subCategoryId) ||
        d.question !== null
      : d.subCategoryId !== null ||
        typeof d.question !== 'string' ||
        !d.question.trim() ||
        d.question.length > 1500
  )
    throw new Error('INVALID_DECISION');
  return d;
}

/** Separate the purchase label from its purpose and the scope authorized by evidence. */
export function groundedDecision(
  raw: unknown,
  input: unknown,
  allowed: number[],
): ClassificationDecision {
  const result = decision(raw, allowed);
  if (result.kind === 'clarify') return result;
  const assessment = (
    raw as {
      assessment?: {
        purchaseKnown: boolean;
        purpose: string;
        purposeEvidence: string | null;
        permanentRuleSupported: boolean;
        uncertainties: string[];
      };
    }
  ).assessment;
  const data = input as {
    profile?: { personal?: string; business?: string };
    transaction?: { note?: string };
    answer?: string;
    categories?: { id: number; private: boolean }[];
  };
  const sources = [
    data.profile?.personal,
    data.profile?.business,
    data.transaction?.note,
    data.answer,
  ].filter((v): v is string => typeof v === 'string');
  const category = data.categories?.find((c) => c.id === result.subCategoryId);
  if (
    !assessment ||
    !assessment.purchaseKnown ||
    !assessment.permanentRuleSupported ||
    !['business', 'private'].includes(assessment.purpose) ||
    !Array.isArray(assessment.uncertainties) ||
    assessment.uncertainties.length ||
    typeof assessment.purposeEvidence !== 'string' ||
    !assessment.purposeEvidence.trim() ||
    !sources.some((text) => text.includes(assessment.purposeEvidence)) ||
    !category ||
    category.private !== (assessment.purpose === 'private')
  ) {
    return {
      kind: 'clarify',
      subCategoryId: null,
      reason: 'אין מספיק ראיות למטרת התשלום וליצירת כלל קבוע.',
      question:
        'האם התשלום מיועד לעסק או לשימוש פרטי, והאם כך יש לסווג גם תשלומים עתידיים לאותו בית עסק בחשבון הזה?',
    };
  }
  return result;
}
