import { Injectable } from '@angular/core';
import {
  getAuth,
  getIdTokenResult,
  getMultiFactorResolver,
  multiFactor,
  MultiFactorError,
  MultiFactorResolver,
  PhoneAuthProvider,
  PhoneMultiFactorInfo,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
  signOut,
  UserCredential,
} from 'firebase/auth';

export type MfaSessionState =
  | 'SIGNED_OUT'
  | 'NOT_ENROLLED'
  | 'VERIFICATION_REQUIRED'
  | 'VERIFIED';

@Injectable({ providedIn: 'root' })
export class MfaService {
  async sessionState(): Promise<MfaSessionState> {
    const user = getAuth().currentUser;
    if (!user) return 'SIGNED_OUT';
    if (multiFactor(user).enrolledFactors.length === 0) return 'NOT_ENROLLED';

    const token = await getIdTokenResult(user);
    const firebaseClaims = token.claims['firebase'] as
      | { sign_in_second_factor?: string }
      | undefined;
    return firebaseClaims?.sign_in_second_factor
      ? 'VERIFIED'
      : 'VERIFICATION_REQUIRED';
  }

  createInvisibleRecaptcha(containerId: string): RecaptchaVerifier {
    const auth = getAuth();
    auth.languageCode = 'he';
    return new RecaptchaVerifier(auth, containerId, { size: 'invisible' });
  }

  normalizePhoneNumber(value: string): string {
    const compact = value.trim().replace(/[\s()-]/g, '');
    if (/^05\d{8}$/.test(compact)) {
      return `+972${compact.slice(1)}`;
    }
    if (/^9725\d{8}$/.test(compact)) {
      return `+${compact}`;
    }
    if (/^\+[1-9]\d{7,14}$/.test(compact)) {
      return compact;
    }
    throw new Error('Invalid E.164 phone number');
  }

  async sendEnrollmentSms(
    phoneNumber: string,
    verifier: RecaptchaVerifier,
  ): Promise<string> {
    const user = getAuth().currentUser;
    if (!user) throw new Error('MFA enrollment requires an authenticated user');
    if (!user.emailVerified) throw new Error('MFA enrollment requires a verified email');

    const session = await multiFactor(user).getSession();
    return new PhoneAuthProvider(getAuth()).verifyPhoneNumber(
      {
        phoneNumber: this.normalizePhoneNumber(phoneNumber),
        session,
      },
      verifier,
    );
  }

  async completeSmsEnrollment(
    verificationId: string,
    code: string,
  ): Promise<void> {
    const user = getAuth().currentUser;
    if (!user) throw new Error('MFA enrollment requires an authenticated user');

    const credential = PhoneAuthProvider.credential(
      verificationId,
      code.trim(),
    );
    await multiFactor(user).enroll(
      PhoneMultiFactorGenerator.assertion(credential),
      'Keepintax SMS',
    );

    // The first-factor-only session that performed enrollment is not accepted
    // by the backend. A fresh sign-in proves both factors and receives the
    // sign_in_second_factor claim.
    await signOut(getAuth());
  }

  resolverFrom(error: unknown): MultiFactorResolver {
    return getMultiFactorResolver(getAuth(), error as MultiFactorError);
  }

  maskedPhoneNumber(resolver: MultiFactorResolver): string | null {
    const hint = resolver.hints.find(
      item => item.factorId === PhoneMultiFactorGenerator.FACTOR_ID,
    ) as PhoneMultiFactorInfo | undefined;
    return hint?.phoneNumber ?? null;
  }

  async sendSignInSms(
    resolver: MultiFactorResolver,
    verifier: RecaptchaVerifier,
  ): Promise<string> {
    const hint = resolver.hints.find(
      item => item.factorId === PhoneMultiFactorGenerator.FACTOR_ID,
    );
    if (!hint) throw new Error('No enrolled SMS factor is available');

    return new PhoneAuthProvider(getAuth()).verifyPhoneNumber(
      {
        multiFactorHint: hint,
        session: resolver.session,
      },
      verifier,
    );
  }

  async resolveSmsSignIn(
    resolver: MultiFactorResolver,
    verificationId: string,
    code: string,
  ): Promise<UserCredential> {
    const credential = PhoneAuthProvider.credential(verificationId, code.trim());
    return resolver.resolveSignIn(
      PhoneMultiFactorGenerator.assertion(credential),
    );
  }

  isChallengeError(error: any): boolean {
    return error?.code === 'auth/multi-factor-auth-required';
  }
}
