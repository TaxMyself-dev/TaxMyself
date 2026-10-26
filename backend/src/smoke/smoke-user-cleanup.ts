export type SmokeCleanupInput = {
  runId: string;
  email: string;
  firebaseId?: string;
  folderName: string;
};

export type SmokeDbUser = {
  firebaseId: string;
  email: string;
  fName: string;
  lName: string | null;
  driveFolderId: string | null;
};

export type SmokeCleanupResult = {
  runId: string;
  databaseUserFound: boolean;
  firebaseUserFound: boolean;
  driveFolderDeleted: boolean;
  deletedRows: Record<string, number>;
};

export interface SmokeCleanupDatabase {
  assertDatabase(expectedDatabase: string): Promise<void>;
  findUser(email: string): Promise<SmokeDbUser | null>;
  deleteSignupRows(
    firebaseId: string,
    email: string,
  ): Promise<Record<string, number>>;
}

export interface SmokeCleanupFirebase {
  findUserByEmail(
    email: string,
  ): Promise<{ firebaseId: string; email: string } | null>;
  deleteUser(firebaseId: string): Promise<void>;
}

export interface SmokeCleanupDrive {
  deleteUserFolder(
    expectedFolderName: string,
    waitForProvisioning: boolean,
  ): Promise<boolean>;
}

export type SmokeCleanupDependencies = {
  database: SmokeCleanupDatabase;
  firebase: SmokeCleanupFirebase;
  drive: SmokeCleanupDrive;
};

const RUN_ID_PATTERN = /^[a-z]{12,32}$/;
export const SMOKE_USER_EMAIL = 'smoke-test@keepintax.co.il';

export function validateSmokeCleanupInput(input: SmokeCleanupInput): void {
  const email = input.email.trim().toLowerCase();
  const expectedFolder = `Keepintax Smoke${input.runId}`;

  if (!RUN_ID_PATTERN.test(input.runId)) {
    throw new Error('Smoke run id must contain 12-32 lowercase letters');
  }
  if (email !== SMOKE_USER_EMAIL) {
    throw new Error('Smoke email does not match the guarded fixed address');
  }
  if (input.folderName !== expectedFolder) {
    throw new Error('Smoke folder name does not match the guarded run id');
  }
}

export class SmokeUserCleanup {
  constructor(private readonly dependencies: SmokeCleanupDependencies) {}

  async run(
    input: SmokeCleanupInput,
    expectedDatabase: string,
  ): Promise<SmokeCleanupResult> {
    validateSmokeCleanupInput(input);
    if (!expectedDatabase.trim()) {
      throw new Error('Expected database name is required');
    }

    const { database, firebase, drive } = this.dependencies;
    await database.assertDatabase(expectedDatabase);

    const dbUser = await database.findUser(input.email);
    if (dbUser) {
      if (dbUser.email.toLowerCase() !== input.email.toLowerCase()) {
        throw new Error(
          'Database identity does not exactly match the smoke user',
        );
      }
      const expectedName = [dbUser.fName, dbUser.lName]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (expectedName !== input.folderName) {
        throw new Error(
          'Database user name does not match the guarded smoke folder',
        );
      }
    }

    const firebaseUser = await firebase.findUserByEmail(input.email);
    if (
      firebaseUser &&
      firebaseUser.email.toLowerCase() !== input.email.toLowerCase()
    ) {
      throw new Error(
        'Firebase identity does not exactly match the smoke user',
      );
    }
    const firebaseIds = [
      input.firebaseId?.trim() || null,
      dbUser?.firebaseId ?? null,
      firebaseUser?.firebaseId ?? null,
    ].filter((value): value is string => !!value);
    if (new Set(firebaseIds).size > 1) {
      throw new Error(
        'Firebase and database identities disagree for the smoke user',
      );
    }
    const firebaseId = firebaseIds[0] ?? null;

    const driveFolderDeleted = await drive.deleteUserFolder(
      input.folderName,
      !!dbUser,
    );

    if (firebaseUser && firebaseId) {
      await firebase.deleteUser(firebaseId);
    }

    const deletedRows = firebaseId
      ? await database.deleteSignupRows(firebaseId, input.email)
      : {};

    return {
      runId: input.runId,
      databaseUserFound: !!dbUser,
      firebaseUserFound: !!firebaseUser,
      driveFolderDeleted,
      deletedRows,
    };
  }
}
