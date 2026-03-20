/**
 * Possible outcomes of classifyWithRule().
 *
 * 'applied'               – Rule created/updated, slim + cache updated.
 * 'blocked_vat_reported'  – Transaction already VAT-reported. Hard stop.
 * 'confirm_override'      – Existing ONE_TIME classification requires
 *                           explicit user confirmation before override.
 * 'confirm_rule_override' – An existing rule with the same signature will be
 *                           overridden. Requires explicit user confirmation.
 */
export type ClassifyWithRuleStatus =
  | 'applied'
  | 'blocked_vat_reported'
  | 'confirm_override'
  | 'confirm_rule_override';

export interface ClassifyWithRuleResult {
  status: ClassifyWithRuleStatus;

  /** Present when status = 'applied'. */
  ruleId?: number;

  /** Number of existing cache rows updated by the backfill. Present when status = 'applied'. */
  backfillCount?: number;

  /** Human-readable explanation for the client. */
  message: string;
}
