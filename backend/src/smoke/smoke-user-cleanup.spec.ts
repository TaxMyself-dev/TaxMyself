import {
  SmokeCleanupDatabase,
  SmokeCleanupDrive,
  SmokeCleanupFirebase,
  SmokeCleanupInput,
  SmokeUserCleanup,
  validateSmokeCleanupInput,
} from './smoke-user-cleanup';

const input: SmokeCleanupInput = {
  runId: 'abcdefghijkl',
  email: 'smoke-test@keepintax.co.il',
  firebaseId: 'firebase-smoke-uid',
  folderName: 'Keepintax Smokeabcdefghijkl',
};

function dependencies() {
  const database: jest.Mocked<SmokeCleanupDatabase> = {
    assertDatabase: jest.fn().mockResolvedValue(undefined),
    findUser: jest.fn().mockResolvedValue({
      firebaseId: input.firebaseId,
      email: input.email,
      fName: 'Keepintax',
      lName: 'Smokeabcdefghijkl',
      driveFolderId: 'drive-folder-id',
    }),
    deleteSignupRows: jest.fn().mockResolvedValue({
      subscriptions: 1,
      users: 1,
    }),
  };
  const firebase: jest.Mocked<SmokeCleanupFirebase> = {
    findUserByEmail: jest.fn().mockResolvedValue({
      firebaseId: input.firebaseId,
      email: input.email,
    }),
    deleteUser: jest.fn().mockResolvedValue(undefined),
  };
  const drive: jest.Mocked<SmokeCleanupDrive> = {
    deleteUserFolder: jest.fn().mockResolvedValue(true),
  };
  return { database, firebase, drive };
}

describe('SmokeUserCleanup', () => {
  it('rejects any email outside the exact guarded smoke namespace', () => {
    expect(() =>
      validateSmokeCleanupInput({
        ...input,
        email: 'real-user@smoke.example.com',
      }),
    ).toThrow('Smoke email does not match');
  });

  it('rejects folder names that cannot be derived from the run id', () => {
    expect(() =>
      validateSmokeCleanupInput({ ...input, folderName: 'Real Customer' }),
    ).toThrow('Smoke folder name does not match');
  });

  it('verifies every identity before deleting external and database data', async () => {
    const deps = dependencies();
    const service = new SmokeUserCleanup(deps);

    await expect(service.run(input, 'keepintax-prod')).resolves.toEqual({
      runId: input.runId,
      databaseUserFound: true,
      firebaseUserFound: true,
      driveFolderDeleted: true,
      deletedRows: { subscriptions: 1, users: 1 },
    });
    expect(deps.database.assertDatabase).toHaveBeenCalledWith('keepintax-prod');
    expect(deps.drive.deleteUserFolder).toHaveBeenCalledWith(
      input.folderName,
      true,
    );
    expect(deps.firebase.deleteUser).toHaveBeenCalledWith(input.firebaseId);
    expect(deps.database.deleteSignupRows).toHaveBeenCalledWith(
      input.firebaseId,
      input.email,
    );
    expect(
      deps.drive.deleteUserFolder.mock.invocationCallOrder[0],
    ).toBeLessThan(deps.firebase.deleteUser.mock.invocationCallOrder[0]);
    expect(deps.firebase.deleteUser.mock.invocationCallOrder[0]).toBeLessThan(
      deps.database.deleteSignupRows.mock.invocationCallOrder[0],
    );
  });

  it('refuses a database row whose name is not the guarded smoke name', async () => {
    const deps = dependencies();
    deps.database.findUser.mockResolvedValue({
      firebaseId: input.firebaseId,
      email: input.email,
      fName: 'Real',
      lName: 'Customer',
      driveFolderId: 'drive-folder-id',
    });

    await expect(
      new SmokeUserCleanup(deps).run(input, 'keepintax-prod'),
    ).rejects.toThrow('Database user name does not match');
    expect(deps.drive.deleteUserFolder).not.toHaveBeenCalled();
    expect(deps.firebase.deleteUser).not.toHaveBeenCalled();
    expect(deps.database.deleteSignupRows).not.toHaveBeenCalled();
  });

  it('refuses a Firebase uid owned by another email', async () => {
    const deps = dependencies();
    deps.firebase.findUserByEmail.mockResolvedValue({
      firebaseId: input.firebaseId,
      email: 'real-user@example.com',
    });

    await expect(
      new SmokeUserCleanup(deps).run(input, 'keepintax-prod'),
    ).rejects.toThrow('Firebase identity does not exactly match');
    expect(deps.drive.deleteUserFolder).not.toHaveBeenCalled();
    expect(deps.firebase.deleteUser).not.toHaveBeenCalled();
    expect(deps.database.deleteSignupRows).not.toHaveBeenCalled();
  });

  it('is retry-safe when Firebase and the database row are already gone', async () => {
    const deps = dependencies();
    deps.database.findUser.mockResolvedValue(null);
    deps.firebase.findUserByEmail.mockResolvedValue(null);
    deps.database.deleteSignupRows.mockResolvedValue({});

    await expect(
      new SmokeUserCleanup(deps).run(input, 'keepintax-prod'),
    ).resolves.toMatchObject({
      databaseUserFound: false,
      firebaseUserFound: false,
    });
    expect(deps.firebase.deleteUser).not.toHaveBeenCalled();
    expect(deps.database.deleteSignupRows).toHaveBeenCalled();
    expect(deps.drive.deleteUserFolder).toHaveBeenCalledWith(
      input.folderName,
      false,
    );
  });

  it('resolves the uid by email when signup fails before the runner captures it', async () => {
    const deps = dependencies();

    await expect(
      new SmokeUserCleanup(deps).run(
        { ...input, firebaseId: undefined },
        'keepintax-prod',
      ),
    ).resolves.toMatchObject({ firebaseUserFound: true });
    expect(deps.firebase.deleteUser).toHaveBeenCalledWith(input.firebaseId);
    expect(deps.database.deleteSignupRows).toHaveBeenCalledWith(
      input.firebaseId,
      input.email,
    );
  });

  it('refuses when Firebase and the database resolve different uids', async () => {
    const deps = dependencies();
    deps.firebase.findUserByEmail.mockResolvedValue({
      firebaseId: 'different-firebase-uid',
      email: input.email,
    });

    await expect(
      new SmokeUserCleanup(deps).run(
        { ...input, firebaseId: undefined },
        'keepintax-prod',
      ),
    ).rejects.toThrow('Firebase and database identities disagree');
    expect(deps.drive.deleteUserFolder).not.toHaveBeenCalled();
  });
});
