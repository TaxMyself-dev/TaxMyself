import 'reflect-metadata';
import * as admin from 'firebase-admin';
import {
  createConnection,
  Connection,
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import { drive_v3, google } from 'googleapis';
import {
  SmokeCleanupDatabase,
  SmokeCleanupDrive,
  SmokeCleanupFirebase,
  SmokeCleanupInput,
  SmokeDbUser,
  SMOKE_USER_EMAIL,
  SmokeUserCleanup,
} from './smoke-user-cleanup';
import { requiredSmokeEnv } from './smoke-env';

const EXPECTED_PRODUCTION_DATABASE = 'keepintax-prod';

type UserRow = RowDataPacket & SmokeDbUser;
type DatabaseNameRow = RowDataPacket & { databaseName: string };

class MysqlSmokeCleanupDatabase implements SmokeCleanupDatabase {
  constructor(private readonly connection: Connection) {}

  async assertDatabase(expectedDatabase: string): Promise<void> {
    const [rows] = await this.connection.query<DatabaseNameRow[]>(
      'SELECT DATABASE() AS databaseName',
    );
    if (rows.length !== 1 || rows[0].databaseName !== expectedDatabase) {
      throw new Error(
        'Connected database does not match SMOKE_EXPECTED_DATABASE',
      );
    }
  }

  async findUsers(email: string): Promise<SmokeDbUser[]> {
    const [rows] = await this.connection.execute<UserRow[]>(
      `SELECT firebaseId, email, fName, lName, drive_folder_id AS driveFolderId
       FROM \`user\`
       WHERE LOWER(email) = LOWER(?)`,
      [email],
    );
    return rows;
  }

  async deleteSignupRows(
    firebaseId: string,
    email: string,
  ): Promise<Record<string, number>> {
    await this.connection.beginTransaction();
    try {
      const [lockedRows] = await this.connection.execute<UserRow[]>(
        `SELECT firebaseId, email, fName, lName, drive_folder_id AS driveFolderId
         FROM \`user\`
         WHERE firebaseId = ?
         FOR UPDATE`,
        [firebaseId],
      );
      if (lockedRows.length > 1) {
        throw new Error('Smoke identity changed during cleanup');
      }
      if (
        lockedRows[0] &&
        (lockedRows[0].firebaseId !== firebaseId ||
          lockedRows[0].email.toLowerCase() !== email.toLowerCase())
      ) {
        throw new Error('Smoke database identity changed during cleanup');
      }

      const deleted: Record<string, number> = {};
      deleted.delegations = await this.delete(
        'DELETE FROM delegation WHERE userId = ? OR agentId = ?',
        [firebaseId, firebaseId],
      );
      deleted.children = await this.delete(
        'DELETE FROM child WHERE parentUserID = ?',
        [firebaseId],
      );
      deleted.businesses = await this.delete(
        'DELETE FROM business WHERE firebaseId = ?',
        [firebaseId],
      );
      deleted.moduleSubscriptions = await this.delete(
        'DELETE FROM user_module_subscription WHERE firebaseId = ?',
        [firebaseId],
      );
      deleted.subscriptions = await this.delete(
        'DELETE FROM subscription WHERE firebase_id = ?',
        [firebaseId],
      );
      deleted.users = await this.delete(
        'DELETE FROM `user` WHERE firebaseId = ? AND LOWER(email) = LOWER(?)',
        [firebaseId, email],
      );

      await this.connection.commit();
      return deleted;
    } catch (error) {
      await this.connection.rollback();
      throw error;
    }
  }

  private async delete(sql: string, parameters: string[]): Promise<number> {
    const [result] = await this.connection.execute<ResultSetHeader>(
      sql,
      parameters,
    );
    return result.affectedRows;
  }
}

class AdminSmokeCleanupFirebase implements SmokeCleanupFirebase {
  async findUserByEmail(
    email: string,
  ): Promise<{ firebaseId: string; email: string } | null> {
    try {
      const user = await admin.auth().getUserByEmail(email);
      return user.email ? { firebaseId: user.uid, email: user.email } : null;
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found') return null;
      throw error;
    }
  }

  async deleteUser(firebaseId: string): Promise<void> {
    try {
      await admin.auth().deleteUser(firebaseId);
    } catch (error: any) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }
}

class GoogleSmokeCleanupDrive implements SmokeCleanupDrive {
  private readonly drive: drive_v3.Drive;
  private readonly rootFolderId: string;

  constructor() {
    const credentials = JSON.parse(
      requiredSmokeEnv('GOOGLE_SERVICE_ACCOUNT_JSON'),
    );
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.drive = google.drive({ version: 'v3', auth });
    this.rootFolderId = requiredSmokeEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID');
  }

  async deleteUserFolder(
    expectedFolderName: string,
    waitForProvisioning: boolean,
  ): Promise<boolean> {
    let folderId: string | null = null;
    const settleMs = Number(process.env.SMOKE_DRIVE_SETTLE_MS ?? 60_000);
    if (!Number.isFinite(settleMs) || settleMs < 0 || settleMs > 60_000) {
      throw new Error('SMOKE_DRIVE_SETTLE_MS must be between 0 and 60000');
    }
    const deadline = Date.now() + settleMs;
    while (!folderId) {
      folderId = await this.findExactFolder(expectedFolderName);
      if (folderId || !waitForProvisioning || Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    if (!folderId) return false;
    try {
      await this.drive.files.delete({
        fileId: folderId,
        supportsAllDrives: true,
      });
    } catch (error: any) {
      const status = error?.code ?? error?.response?.status;
      if (status !== 404) throw error;
    }
    return true;
  }

  private async findExactFolder(name: string): Promise<string | null> {
    const safeName = name.replace(/'/g, "\\'");
    const response = await this.drive.files.list({
      q: [
        `name = '${safeName}'`,
        `mimeType = 'application/vnd.google-apps.folder'`,
        `'${this.rootFolderId}' in parents`,
        'trashed = false',
      ].join(' and '),
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 2,
    });
    const matches = response.data.files ?? [];
    if (matches.length > 1) {
      throw new Error('More than one exact smoke Drive folder was found');
    }
    return matches[0]?.id ?? null;
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
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

async function main(): Promise<void> {
  if (process.env.SMOKE_CLEANUP_ENABLED !== 'true') {
    throw new Error('SMOKE_CLEANUP_ENABLED=true is required');
  }

  const runId = required('SMOKE_RUN_ID');
  const input: SmokeCleanupInput = {
    runId,
    email: SMOKE_USER_EMAIL,
    firebaseId: process.env.SMOKE_FIREBASE_UID?.trim() || undefined,
    folderName: `Keepintax Smoke${runId}`,
  };
  const connection = await createConnection({
    host: required('DB_HOST'),
    port: Number(process.env.DB_PORT) || 3306,
    user: required('DB_USERNAME'),
    password: required('DB_PASSWORD'),
    database: required('DB_DATABASE'),
    multipleStatements: false,
  });

  try {
    initializeFirebase();
    const cleanup = new SmokeUserCleanup({
      database: new MysqlSmokeCleanupDatabase(connection),
      firebase: new AdminSmokeCleanupFirebase(),
      drive: new GoogleSmokeCleanupDrive(),
    });
    const result = await cleanup.run(input, EXPECTED_PRODUCTION_DATABASE);
    console.log(JSON.stringify(result));
  } finally {
    await connection.end();
  }
}

main().catch((error: any) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error?.code ?? 'SMOKE_CLEANUP_FAILED',
      message: error?.message ?? 'Unknown cleanup failure',
    }),
  );
  process.exitCode = 1;
});
