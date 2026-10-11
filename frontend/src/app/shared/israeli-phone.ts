import { Validators, ValidatorFn } from '@angular/forms';

/**
 * Single source of truth for ordinary Israeli phone numbers (landline and
 * mobile): contiguous digits only. 02/03/04/08/09 → 9 digits, 05/07 → 10
 * digits. Service numbers and international formats are intentionally
 * unsupported and nothing is auto-cleaned. Keep in sync with
 * backend/src/shared/israeli-phone.ts.
 */
export const ISRAELI_PHONE_PATTERN = /^0(?:[23489]\d{7}|[57]\d{8})$/;

export const ISRAELI_PHONE_ERROR =
  'יש להזין מספר טלפון ישראלי תקין, בספרות בלבד וללא רווחים או מקפים';

/** Empty values pass (Validators.pattern ignores them); add Validators.required for mandatory fields. */
export function israeliPhoneValidator(): ValidatorFn {
  return Validators.pattern(ISRAELI_PHONE_PATTERN);
}

/** Non-form check; an empty value is valid. */
export function isValidIsraeliPhone(value: string | null | undefined): boolean {
  return !value || ISRAELI_PHONE_PATTERN.test(value);
}
