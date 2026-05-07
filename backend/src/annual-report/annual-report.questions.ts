import { AnnualReportDocCategory, RequiredCategoryEntry } from './annual-report.entity';

/**
 * Question schema for the annual-report wizard.
 * - boolean questions accept true/false answers; if true and they have `requires`, the listed categories
 *   are added to `requiredCategories` with `minCount = 1`.
 * - number questions accept a positive integer; if `useAnswerAsCount` is set on a require, the answer
 *   becomes the minCount for that category. Number questions are usually conditional on a parent boolean.
 */
export type AnnualReportQuestionType = 'boolean' | 'number';

export interface AnnualReportRequire {
  category: AnnualReportDocCategory;
  /** when true, the numeric answer to this question becomes minCount; otherwise minCount = 1 */
  useAnswerAsCount?: boolean;
}

export interface AnnualReportQuestion {
  id: string;
  type: AnnualReportQuestionType;
  /** Show this question only when `dependsOn.questionId` answer equals `dependsOn.equals`. */
  dependsOn?: { questionId: string; equals: boolean };
  requires?: AnnualReportRequire[];
}

export const ANNUAL_REPORT_QUESTIONS: AnnualReportQuestion[] = [
  { id: 'employed', type: 'boolean' },
  {
    id: 'employerCount',
    type: 'number',
    dependsOn: { questionId: 'employed', equals: true },
    requires: [{ category: AnnualReportDocCategory.FORM_106, useAnswerAsCount: true }],
  },
  { id: 'married', type: 'boolean' },
  {
    id: 'spouseEmployed',
    type: 'boolean',
    dependsOn: { questionId: 'married', equals: true },
  },
  {
    id: 'spouseEmployerCount',
    type: 'number',
    dependsOn: { questionId: 'spouseEmployed', equals: true },
    requires: [{ category: AnnualReportDocCategory.SPOUSE_FORM_106, useAnswerAsCount: true }],
  },
  { id: 'donations', type: 'boolean', requires: [{ category: AnnualReportDocCategory.DONATION_RECEIPT }] },
  { id: 'pension', type: 'boolean', requires: [{ category: AnnualReportDocCategory.PENSION_867 }] },
  { id: 'lifeInsurance', type: 'boolean', requires: [{ category: AnnualReportDocCategory.LIFE_INSURANCE }] },
  { id: 'rentalIncome', type: 'boolean', requires: [{ category: AnnualReportDocCategory.RENTAL_INCOME }] },
  { id: 'investments', type: 'boolean', requires: [{ category: AnnualReportDocCategory.INVESTMENT_867 }] },
];

/**
 * Compute required document categories with their minimum counts from the answers.
 * Honors `dependsOn`, skips inactive boolean answers, treats numeric answers < 1 as inactive.
 * If multiple questions require the same category, the larger minCount wins.
 */
export function computeRequiredCategories(
  answers: Record<string, unknown> | null | undefined,
): RequiredCategoryEntry[] {
  if (!answers) return [];
  const map = new Map<AnnualReportDocCategory, number>();

  for (const q of ANNUAL_REPORT_QUESTIONS) {
    if (q.dependsOn && answers[q.dependsOn.questionId] !== q.dependsOn.equals) continue;
    if (!q.requires) continue;

    const ans = answers[q.id];
    let active: boolean;
    let numericAnswer = 1;
    if (q.type === 'boolean') {
      active = ans === true;
    } else {
      active = typeof ans === 'number' && ans >= 1;
      if (active) numericAnswer = Math.floor(ans as number);
    }
    if (!active) continue;

    for (const req of q.requires) {
      const count = req.useAnswerAsCount ? Math.max(1, numericAnswer) : 1;
      const prev = map.get(req.category) ?? 0;
      map.set(req.category, Math.max(prev, count));
    }
  }
  return Array.from(map.entries()).map(([category, minCount]) => ({ category, minCount }));
}
