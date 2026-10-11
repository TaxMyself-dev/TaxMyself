import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Single source of truth for ordinary Israeli phone numbers (landline and
 * mobile): contiguous digits only. 02/03/04/08/09 → 9 digits, 05/07 → 10
 * digits. Service numbers and international formats are intentionally
 * unsupported and nothing is auto-cleaned. Keep in sync with
 * frontend/src/app/shared/israeli-phone.ts.
 */
export const ISRAELI_PHONE_PATTERN = /^0(?:[23489]\d{7}|[57]\d{8})$/;

export const ISRAELI_PHONE_MESSAGE =
  'יש להזין מספר טלפון ישראלי תקין, בספרות בלבד וללא רווחים או מקפים';

/** Empty/absent values are valid here — combine with @IsNotEmpty() for required fields. */
export function isValidIsraeliPhone(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && ISRAELI_PHONE_PATTERN.test(value);
}

export function IsIsraeliPhone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isIsraeliPhone',
      target: object.constructor,
      propertyName,
      options: { message: ISRAELI_PHONE_MESSAGE, ...options },
      validator: { validate: isValidIsraeliPhone },
    });
}
