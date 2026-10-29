import * as admin from 'firebase-admin';
import {
  SmokeEmailVerifier,
  SmokeVerificationFirebase,
} from './smoke-email-verifier';
import { SMOKE_USER_EMAIL } from './smoke-user-cleanup';
import { requiredSmokeEnv } from './smoke-env';

class AdminSmokeVerificationFirebase implements SmokeVerificationFirebase {
  async findUserByEmail(email: string) {
    try {
      const user = await admin.auth().getUserByEmail(email);
      return user.email
        ? {
            firebaseId: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
          }
        : null;
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found') return null;
      throw error;
    }
  }

  async markEmailVerified(firebaseId: string): Promise<void> {
    await admin.auth().updateUser(firebaseId, { emailVerified: true });
  }
}

function required(name: string): string {
  return requiredSmokeEnv(name);
}

function initializeFirebase(): void {
  if (admin.apps.length > 0) return;
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: required('FIREBASE_PROJECT_ID'),
      clientEmail: required('FIREBASE_CLIENT_EMAIL'),
      privateKey: required('FIREBASE_PRIVATE_KEY')
        .replace(/\\n/g, '\n')
        .replace(/^"|"$/g, ''),
    }),
  });
}

async function main(): Promise<void> {
  if (process.env.SMOKE_VERIFY_ENABLED !== 'true') {
    throw new Error('SMOKE_VERIFY_ENABLED=true is required');
  }
  initializeFirebase();
  const verifier = new SmokeEmailVerifier(new AdminSmokeVerificationFirebase());
  const result = await verifier.run({
    runId: required('SMOKE_RUN_ID'),
    email: SMOKE_USER_EMAIL,
  });
  console.log(JSON.stringify(result));
}

main().catch((error: any) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error?.code ?? 'SMOKE_VERIFY_FAILED',
      message: error?.message ?? 'Unknown verification failure',
    }),
  );
  process.exitCode = 1;
});
