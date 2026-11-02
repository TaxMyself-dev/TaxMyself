import { AuthService } from './auth.service';

describe('Signup error messages', () => {
  const message = (error: unknown) => AuthService.prototype.getSignupErrorMessage(error);
  it('shows the server reason including internal subscription failures', () => {
    expect(message({ status: 500, error: { message: 'לא נמצא מנוי.' } })).toBe('לא נמצא מנוי.');
  });
  it('shows validation messages returned as an array', () => {
    expect(message({ error: { message: ['שדה חסר', 'ערך שגוי'] } })).toBe('שדה חסר\nערך שגוי');
  });
  it('preserves Firebase translations for error objects and legacy code callers', () => {
    expect(message({ code: 'auth/email-already-in-use' })).toBe(message('auth/email-already-in-use'));
    expect(message({ code: 'auth/email-already-in-use' })).toContain('כתובת האימייל כבר רשומה');
  });
  it('falls back for malformed or missing server messages', () => {
    expect(message({ error: { message: [null, 42] } })).toContain('שגיאה לא צפויה');
    expect(message(null)).toContain('שגיאה לא צפויה');
  });
});
