import { Injectable } from '@angular/core';
import {
  getAuth,
  getIdTokenResult,
  getMultiFactorResolver,
  multiFactor,
  MultiFactorError,
  MultiFactorResolver,
  signOut,
  TotpMultiFactorGenerator,
  TotpSecret,
  UserCredential,
} from 'firebase/auth';

export type MfaSessionState =
  | 'SIGNED_OUT'
  | 'NOT_ENROLLED'
  | 'VERIFICATION_REQUIRED'
  | 'VERIFIED';

export interface TotpEnrollmentDetails {
  secret: TotpSecret;
  secretKey: string;
}

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

  async beginTotpEnrollment(): Promise<TotpEnrollmentDetails> {
    const user = getAuth().currentUser;
    if (!user) throw new Error('MFA enrollment requires an authenticated user');
    if (!user.emailVerified) throw new Error('MFA enrollment requires a verified email');

    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    return {
      secret,
      secretKey: secret.secretKey,
    };
  }

  async completeTotpEnrollment(secret: TotpSecret, code: string): Promise<void> {
    const user = getAuth().currentUser;
    if (!user) throw new Error('MFA enrollment requires an authenticated user');

    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
      secret,
      code.trim(),
    );
    await multiFactor(user).enroll(assertion, 'Keepintax Authenticator');

    // The first-factor-only session that performed enrollment is not accepted
    // by the backend. A fresh sign-in proves both factors and receives the
    // sign_in_second_factor claim.
    await signOut(getAuth());
  }

  resolverFrom(error: unknown): MultiFactorResolver {
    return getMultiFactorResolver(getAuth(), error as MultiFactorError);
  }

  async resolveTotpSignIn(
    resolver: MultiFactorResolver,
    code: string,
  ): Promise<UserCredential> {
    const hint = resolver.hints.find(
      item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID,
    );
    if (!hint) throw new Error('No enrolled TOTP factor is available');

    return resolver.resolveSignIn(
      TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code.trim()),
    );
  }

  isChallengeError(error: any): boolean {
    return error?.code === 'auth/multi-factor-auth-required';
  }
}
