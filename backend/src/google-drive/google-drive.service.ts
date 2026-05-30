import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { drive_v3, google } from 'googleapis';

export type DriveRole = 'reader' | 'writer' | 'commenter';

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);
  private driveClient: drive_v3.Drive | null = null;
  private rootFolderIdCached: string | null = null;

  private getDrive(): { drive: drive_v3.Drive; rootFolderId: string } {
    if (this.driveClient && this.rootFolderIdCached) {
      return { drive: this.driveClient, rootFolderId: this.rootFolderIdCached };
    }

    const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!rawJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is missing');
    }
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId) {
      throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID env var is missing');
    }

    const credentials = JSON.parse(rawJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    this.driveClient = google.drive({ version: 'v3', auth });
    this.rootFolderIdCached = rootFolderId;
    return { drive: this.driveClient, rootFolderId };
  }

  async createUserFolder(folderName: string, userEmail: string): Promise<string> {
    const safeName = this.sanitizeFolderName(folderName);
    try {
      const { drive, rootFolderId } = this.getDrive();
      const res = await drive.files.create({
        requestBody: {
          name: safeName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [rootFolderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      });

      const folderId = res.data.id;
      if (!folderId) {
        throw new Error('Drive API returned no folder id');
      }

      if (userEmail) {
        await this.shareFolder(folderId, userEmail, 'writer');
      }

      this.logger.log(
        `Created Drive folder ${folderId} ("${safeName}") for ${userEmail || 'no email'}`,
      );

      // No year-scaffold here — years live inside per-business sub-folders now.
      // See ensureBusinessFolder().

      return folderId;
    } catch (error) {
      this.logger.error(
        `createUserFolder failed for name="${safeName}": ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException(
        'Failed to create user Drive folder',
      );
    }
  }

  /**
   * Build the current-year + previous-year layout (months 01-12 + "דוח שנתי")
   * under any parent folder. Sequential — Drive throttles fast bursts.
   */
  private async scaffoldRecentYears(parentFolderId: string): Promise<void> {
    const currentYear = new Date().getFullYear();
    for (const year of [currentYear, currentYear - 1]) {
      const yearFolderId = await this.getOrCreateChildFolder(parentFolderId, String(year));
      for (let m = 1; m <= 12; m++) {
        await this.getOrCreateChildFolder(yearFolderId, String(m).padStart(2, '0'));
      }
      await this.getOrCreateChildFolder(yearFolderId, 'דוח שנתי');
    }
  }

  /**
   * Find-or-create a business sub-folder under the user's root folder. Returns
   * the folder id. Best-effort scaffolding of 2 years × 12 months + דוח שנתי
   * happens after creation — failures are logged but don't fail the call,
   * because getOrCreateMonthFolder will fill any gap later.
   */
  async ensureBusinessFolder(userFolderId: string, businessName: string): Promise<string> {
    const safeName = this.sanitizeFolderName(businessName) || 'business';
    const folderId = await this.getOrCreateChildFolder(userFolderId, safeName);
    try {
      await this.scaffoldRecentYears(folderId);
    } catch (err: any) {
      this.logger.error(
        `ensureBusinessFolder: scaffold failed for folderId=${folderId}: ${err?.message ?? err}`,
        err?.stack,
      );
    }
    return folderId;
  }

  private sanitizeFolderName(raw: string): string {
    // Drive accepts most chars; slashes confuse the UI breadcrumbs.
    const cleaned = (raw ?? '').replace(/[\\/]/g, '-').trim();
    return cleaned || 'user';
  }

  async getOrCreateMonthFolder(
    userFolderId: string,
    yearMonth: string,
  ): Promise<string> {
    const match = /^(\d{4})-(\d{2})$/.exec(yearMonth);
    if (!match) {
      throw new InternalServerErrorException(
        `getOrCreateMonthFolder: yearMonth must be YYYY-MM, got "${yearMonth}"`,
      );
    }
    const [, year, month] = match;
    try {
      const yearFolderId = await this.getOrCreateChildFolder(userFolderId, year);
      return await this.getOrCreateChildFolder(yearFolderId, month);
    } catch (error) {
      this.logger.error(
        `getOrCreateMonthFolder failed (parent=${userFolderId}, ym=${yearMonth}): ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException(
        'Failed to get or create month folder',
      );
    }
  }

  private async getOrCreateChildFolder(
    parentId: string,
    name: string,
  ): Promise<string> {
    const { drive } = this.getDrive();
    const safeName = name.replace(/'/g, "\\'");
    const q = [
      `name = '${safeName}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `'${parentId}' in parents`,
      `trashed = false`,
    ].join(' and ');

    const list = await drive.files.list({
      q,
      fields: 'files(id, name)',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const existing = list.data.files?.[0]?.id;
    if (existing) return existing;

    const res = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    const id = res.data.id;
    if (!id) {
      throw new Error(`Drive API returned no id for child folder "${name}"`);
    }
    return id;
  }

  getFolderUrl(folderId: string): string {
    return `https://drive.google.com/drive/folders/${folderId}`;
  }

  async listFolderFiles(folderId: string): Promise<Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number | null;
  }>> {
    try {
      const { drive } = this.getDrive();
      const q = [
        `'${folderId}' in parents`,
        `mimeType != 'application/vnd.google-apps.folder'`,
        `trashed = false`,
      ].join(' and ');

      const out: Array<{ id: string; name: string; mimeType: string; size: number | null }> = [];
      let pageToken: string | undefined = undefined;
      do {
        const res = await drive.files.list({
          q,
          fields: 'nextPageToken, files(id, name, mimeType, size)',
          spaces: 'drive',
          pageSize: 100,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        for (const f of res.data.files ?? []) {
          if (!f.id || !f.name || !f.mimeType) continue;
          out.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : null,
          });
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    } catch (error) {
      this.logger.error(
        `listFolderFiles failed for folderId=${folderId}: ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to list Drive folder');
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      const { drive } = this.getDrive();
      const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' },
      );
      return Buffer.from(res.data as ArrayBuffer);
    } catch (error) {
      this.logger.error(
        `downloadFile failed for fileId=${fileId}: ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to download Drive file');
    }
  }

  async folderExists(folderId: string): Promise<boolean> {
    try {
      const { drive } = this.getDrive();
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id, trashed',
        supportsAllDrives: true,
      });
      return !!res.data.id && res.data.trashed !== true;
    } catch (error: any) {
      if (error?.code === 404 || error?.response?.status === 404) {
        return false;
      }
      this.logger.error(
        `folderExists check failed for folderId=${folderId}: ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to verify Drive folder');
    }
  }

  async shareFolder(
    folderId: string,
    email: string,
    role: DriveRole = 'writer',
  ): Promise<void> {
    try {
      const { drive } = this.getDrive();
      await drive.permissions.create({
        fileId: folderId,
        requestBody: {
          type: 'user',
          role,
          emailAddress: email,
        },
        sendNotificationEmail: false,
        supportsAllDrives: true,
      });
    } catch (error: any) {
      // Idempotency: re-sharing the same folder with the same user returns
      // 409 from the Drive API. Treat that as success so callers can fire
      // shareFolder unconditionally (e.g., on every login backfill).
      const code = error?.code ?? error?.response?.status;
      const message = error?.message ?? '';
      if (code === 409 || /already exists|duplicate/i.test(message)) {
        this.logger.debug(
          `shareFolder: ${email} already has access to ${folderId} — skipping`,
        );
        return;
      }
      this.logger.error(
        `shareFolder failed (folderId=${folderId}, email=${email}, role=${role}): ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to share Drive folder');
    }
  }
}
