import { validateSmokeCleanupInput } from './smoke-user-cleanup';

export type SmokeEmailVerificationInput = {
  runId: string;
  email: string;
};

export interface SmokeVerificationFirebase {
  findUserByEmail(email: string): Promise<{
    firebaseId: string;
    email: string;
    emailVerified: boolean;
  } | null>;
  markEmailVerified(firebaseId: string): Promise<void>;
}

export class SmokeEmailVerifier {
  constructor(private readonly firebase: SmokeVerificationFirebase) {}

  async run(input: SmokeEmailVerificationInput): Promise<{
    runId: string;
    alreadyVerified: boolean;
  }> {
    validateSmokeCleanupInput({
      ...input,
      folderName: `Keepintax Smoke${input.runId}`,
    });

    const user = await this.firebase.findUserByEmail(input.email);
    if (!user) throw new Error('Synthetic Firebase user was not found');
    if (user.email.toLowerCase() !== input.email.toLowerCase()) {
      throw new Error(
        'Firebase identity does not exactly match the smoke user',
      );
    }

    if (!user.emailVerified) {
      await this.firebase.markEmailVerified(user.firebaseId);
    }

    return {
      runId: input.runId,
      alreadyVerified: user.emailVerified,
    };
  }
}
