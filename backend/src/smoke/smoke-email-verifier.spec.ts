import {
  SmokeEmailVerifier,
  SmokeVerificationFirebase,
} from './smoke-email-verifier';

const input = {
  runId: 'abcdefghijkl',
  email: 'smoke-test@keepintax.co.il',
};

function firebase(
  emailVerified = false,
): jest.Mocked<SmokeVerificationFirebase> {
  return {
    findUserByEmail: jest.fn().mockResolvedValue({
      firebaseId: 'firebase-smoke-uid',
      email: input.email,
      emailVerified,
    }),
    markEmailVerified: jest.fn().mockResolvedValue(undefined),
  };
}

describe('SmokeEmailVerifier', () => {
  it('marks only the exact guarded synthetic user as verified', async () => {
    const auth = firebase();

    await expect(new SmokeEmailVerifier(auth).run(input)).resolves.toEqual({
      runId: input.runId,
      alreadyVerified: false,
    });
    expect(auth.markEmailVerified).toHaveBeenCalledWith('firebase-smoke-uid');
  });

  it('is idempotent when the synthetic email is already verified', async () => {
    const auth = firebase(true);

    await expect(
      new SmokeEmailVerifier(auth).run(input),
    ).resolves.toMatchObject({
      alreadyVerified: true,
    });
    expect(auth.markEmailVerified).not.toHaveBeenCalled();
  });

  it('rejects an email outside the guarded namespace before Firebase access', async () => {
    const auth = firebase();

    await expect(
      new SmokeEmailVerifier(auth).run({ ...input, email: 'real@example.com' }),
    ).rejects.toThrow('Smoke email does not match');
    expect(auth.findUserByEmail).not.toHaveBeenCalled();
  });

  it('fails closed when the Firebase user does not exist', async () => {
    const auth = firebase();
    auth.findUserByEmail.mockResolvedValue(null);

    await expect(new SmokeEmailVerifier(auth).run(input)).rejects.toThrow(
      'Synthetic Firebase user was not found',
    );
    expect(auth.markEmailVerified).not.toHaveBeenCalled();
  });
});
