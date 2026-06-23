import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { drive_v3, google } from 'googleapis';

export type DriveRole = 'reader' | 'writer' | 'commenter';

/**
 * Thrown by `uploadFile` when Drive rejects the create because the service
 * account has no storage quota. This is a known Google limitation: service
 * accounts can only upload to **Shared Drives** (Workspace) or via OAuth
 * delegation — not to a regular Drive folder under a personal account.
 *
 * The demo seeder catches this specifically and continues without failing
 * the whole seed (folders are created, just files need to be dropped
 * manually). Production code that actually depends on uploads working
 * should let it bubble.
 */
export class ServiceAccountQuotaError extends Error {
  constructor(originalMessage: string) {
    super(originalMessage);
    this.name = 'ServiceAccountQuotaError';
  }
}

/** Folder IDs returned by ensureBusinessFolder(): the parent business
 *  folder plus inbox/ and processed/ children. */
export interface DriveBusinessFolders {
  folderId: string;
  inboxFolderId: string;
  processedFolderId: string;
}

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  /** Drive's `createdTime` — when the file was uploaded to Drive. ISO-8601
   *  string from the API; the caller usually wraps it in `new Date()` for
   *  the `upload_date` column. */
  createdTime: string | null;
  /** Drive's `md5Checksum` — content hash of the file bytes. Present for
   *  every binary upload (PDF/JPG/PNG); null for Google-native docs (which
   *  aren't supported invoice types). Two uploads of the same file get
   *  different `id`s but the SAME md5 — the signal the inbox dedup uses to
   *  catch byte-identical re-uploads before paying for a second OCR. */
  md5Checksum: string | null;
}

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
      const { rootFolderId } = this.getDrive();
      // Find-or-create under the Drive root. The caller (provisionDriveStructure)
      // already gates on user.driveFolderId, but if that field was wiped
      // (demo re-seed, failed save, manual delete of the User row while the
      // Drive folder survived) we'd otherwise create a duplicate every login.
      // getOrCreateChildFolder searches by name+parent and returns the
      // existing id when present.
      const folderId = await this.getOrCreateChildFolder(rootFolderId, safeName);

      // shareFolder is idempotent (409 swallowed), so re-applying on every
      // call is safe and ensures the share survives if it was manually revoked.
      if (userEmail) {
        await this.shareFolder(folderId, userEmail, 'writer');
      }

      this.logger.log(
        `Resolved Drive folder ${folderId} ("${safeName}") for ${userEmail || 'no email'}`,
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
   * Find-or-create a business sub-folder under the user's root folder,
   * scaffolded with the two operational sub-folders (inbox/, processed/).
   * Returns all three IDs so the caller can persist them on the Business
   * row in one shot.
   *
   * Idempotent at every step — safe to call on every login / report-page
   * visit / backfill run.
   */
  async ensureBusinessFolder(
    userFolderId: string,
    businessName: string,
  ): Promise<DriveBusinessFolders> {
    const safeName = this.sanitizeFolderName(businessName) || 'business';
    const folderId = await this.getOrCreateChildFolder(userFolderId, safeName);
    const subFolders = await this.ensureInboxAndProcessed(folderId);
    return { folderId, ...subFolders };
  }

  /**
   * Create the inbox/processed pair under a business folder. Pulled out
   * as its own method so the backfill admin endpoint (which already has
   * `business.driveFolderId`) can re-provision the children without
   * touching the parent.
   */
  async ensureInboxAndProcessed(
    businessFolderId: string,
  ): Promise<{ inboxFolderId: string; processedFolderId: string }> {
    const inboxFolderId     = await this.getOrCreateChildFolder(businessFolderId, 'inbox');
    const processedFolderId = await this.getOrCreateChildFolder(businessFolderId, 'processed');
    return { inboxFolderId, processedFolderId };
  }

  private sanitizeFolderName(raw: string): string {
    // Drive accepts most chars; slashes confuse the UI breadcrumbs.
    const cleaned = (raw ?? '').replace(/[\\/]/g, '-').trim();
    return cleaned || 'user';
  }

  /**
   * Move a file from one parent folder to another. Drive's API requires
   * both `addParents` and `removeParents` in one `update` call — there's no
   * dedicated "move" verb. Used by the inbox → processed (OCR success)
   * transition.
   *
   * Idempotent in the spec sense: if the file is already in `toParentId`
   * (and not in `fromParentId`), removeParents silently no-ops and addParents
   * returns the existing parent. Caller doesn't need to pre-check.
   */
  async moveFile(
    fileId: string,
    fromParentId: string | null,
    toParentId: string,
  ): Promise<void> {
    try {
      const { drive } = this.getDrive();
      await drive.files.update({
        fileId,
        addParents: toParentId,
        removeParents: fromParentId ?? undefined,
        fields: 'id, parents',
        supportsAllDrives: true,
      });
    } catch (error) {
      this.logger.error(
        `moveFile failed (fileId=${fileId}, from=${fromParentId}, to=${toParentId}): ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to move Drive file');
    }
  }

  /**
   * Read-only sibling of `getOrCreateChildFolder` — returns the folder id if
   * a folder with this name+parent exists, or null. Lets diagnostic code
   * (e.g. the login-banner Drive snapshot) tell the user "folder exists in
   * Drive but no ID is stored in the DB" without side-effects.
   */
  async findChildFolder(parentId: string, name: string): Promise<string | null> {
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
    return list.data.files?.[0]?.id ?? null;
  }

  /** The cached Drive root folder ID (KeepInTax-Clients-Dev / -Prod) — exposed
   *  for diagnostics that need to look up a folder under root by name. */
  getRootFolderId(): string {
    const { rootFolderId } = this.getDrive();
    return rootFolderId;
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

  async listFolderFiles(folderId: string): Promise<DriveFileMeta[]> {
    try {
      const { drive } = this.getDrive();
      const q = [
        `'${folderId}' in parents`,
        `mimeType != 'application/vnd.google-apps.folder'`,
        `trashed = false`,
      ].join(' and ');

      const out: DriveFileMeta[] = [];
      let pageToken: string | undefined = undefined;
      do {
        const res = await drive.files.list({
          q,
          // createdTime feeds extracted_document.upload_date — the timestamp
          // we show the user as "when this invoice arrived in the inbox".
          // md5Checksum feeds the byte-identical dedup in the inbox loop.
          fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, md5Checksum)',
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
            createdTime: f.createdTime ?? null,
            md5Checksum: f.md5Checksum ?? null,
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

  /**
   * Upload an in-memory buffer as a new Drive file under `parentFolderId`.
   * Used by the demo-data seeder/reset to drop the test-samples PDFs into
   * a demo user's inbox. Returns the new Drive file id.
   *
   * `mimeType` defaults to application/pdf since every current caller is
   * pushing PDFs; pass through explicitly when uploading anything else.
   *
   * Throws `ServiceAccountQuotaError` when the underlying Drive call fails
   * with "Service Accounts do not have storage quota" — a known Google
   * limitation when the root folder lives on a personal (non-Workspace)
   * Drive. Callers that just want best-effort uploads (demo seeder) can
   * catch this specific class and continue; everyone else can let it
   * bubble.
   */
  async uploadFile(
    parentFolderId: string,
    name: string,
    body: Buffer,
    mimeType: string = 'application/pdf',
  ): Promise<string> {
    try {
      const { drive } = this.getDrive();
      const { Readable } = await import('stream');
      const res = await drive.files.create({
        requestBody: {
          name,
          parents: [parentFolderId],
          mimeType,
        },
        // googleapis wants a Readable for `media.body`; wrap the buffer.
        media: {
          mimeType,
          body: Readable.from(body),
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      const id = res.data.id;
      if (!id) {
        throw new Error(`Drive API returned no id for uploaded file "${name}"`);
      }
      return id;
    } catch (error: any) {
      const message = error?.message ?? '';
      if (/Service Accounts do not have storage quota|storageQuotaExceeded/i.test(message)) {
        // Don't log the full stack — every demo upload hits this same wall
        // and would flood the log with identical traces. Single concise
        // line is enough; the calling code knows to expect it.
        this.logger.warn(
          `uploadFile: service account has no storage quota (parent=${parentFolderId}, name="${name}") — files must be dropped manually via Drive UI, or migrate the root to a Shared Drive`,
        );
        throw new ServiceAccountQuotaError(message);
      }
      this.logger.error(
        `uploadFile failed (parent=${parentFolderId}, name="${name}"): ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to upload Drive file');
    }
  }

  /**
   * Permanently delete a Drive file. Used by the demo-data reset endpoint
   * to wipe a demo user's Drive folders before re-uploading the canned
   * test samples. Idempotent against 404 — if Drive can't find the file
   * we treat it as already-gone.
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      const { drive } = this.getDrive();
      await drive.files.delete({ fileId, supportsAllDrives: true });
    } catch (error: any) {
      const status = error?.code ?? error?.response?.status;
      if (status === 404) return;
      this.logger.error(
        `deleteFile failed for fileId=${fileId}: ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to delete Drive file');
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

  /**
   * Returns the parent folder IDs of `folderId`, or null if Drive can't
   * resolve the file at all (404 / trashed). Used by the stale-id check
   * to verify a stored business-folder ID is actually parented under the
   * current user root — `folderExists` alone returns true even for folders
   * orphaned under a deleted ancestor, which leaves users staring at empty
   * folders while the DB insists everything is fine.
   */
  async getFolderParents(folderId: string): Promise<string[] | null> {
    try {
      const { drive } = this.getDrive();
      const res = await drive.files.get({
        fileId: folderId,
        fields: 'id, trashed, parents',
        supportsAllDrives: true,
      });
      if (!res.data.id || res.data.trashed === true) return null;
      return res.data.parents ?? [];
    } catch (error: any) {
      if (error?.code === 404 || error?.response?.status === 404) {
        return null;
      }
      this.logger.error(
        `getFolderParents failed for folderId=${folderId}: ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to read Drive folder parents');
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
      // Soft failure: the target email isn't a real Google account, so
      // Drive can't grant access (e.g. demo profiles seeded with fake
      // @taxmyself.local addresses). The folder itself was already
      // created — propagating the failure up would orphan it. Log + move
      // on so business sub-folders + uploads still happen.
      //
      // Drive returns DIFFERENT errors for the same root cause depending on
      // whether the parent is My Drive vs a Shared Drive:
      //   - My Drive: 403 + "do not have a Google Account" (helpful)
      //   - Shared Drive: 400 + "Sorry, an internal error has occurred and
      //     your request was not completed" (vague). Same situation, no
      //     other useful signal — match the phrasing exactly so we don't
      //     accidentally swallow unrelated 400s from this call.
      if (/do not have a Google Account|not a Google account/i.test(message)) {
        this.logger.warn(
          `shareFolder: ${email} isn't a Google account — folder ${folderId} created but not shared with this email`,
        );
        return;
      }
      if (/internal error has occurred and your request was not completed/i.test(message)) {
        this.logger.warn(
          `shareFolder: Drive rejected share to ${email} on folder ${folderId} with generic 400 ` +
            `(common when adding a non-Google-account email to a Shared Drive folder) — folder created, share skipped`,
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

  /**
   * List the user-type permissions on a folder. Used by the share-audit /
   * cleanup job to detect grants that no longer correspond to an active
   * delegation. Only returns `type === 'user'` grants (the only kind this
   * codebase creates); the service-account `owner` grant is included so
   * callers can recognise and skip it.
   */
  async listFolderPermissions(
    folderId: string,
  ): Promise<Array<{ id: string; emailAddress: string; role: string }>> {
    const { drive } = this.getDrive();
    const out: Array<{ id: string; emailAddress: string; role: string }> = [];
    let pageToken: string | undefined = undefined;
    do {
      const res = await drive.permissions.list({
        fileId: folderId,
        fields: 'nextPageToken, permissions(id, type, emailAddress, role)',
        pageSize: 100,
        pageToken,
        supportsAllDrives: true,
      });
      for (const p of res.data.permissions ?? []) {
        if (p.type === 'user' && p.id && p.emailAddress) {
          out.push({ id: p.id, emailAddress: p.emailAddress, role: p.role ?? '' });
        }
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  /**
   * Remove a single user's access to a folder, looked up by email. The
   * inverse of `shareFolder` — called when a delegation ends so an
   * accountant stops seeing a client's folder. Returns true if a matching
   * grant was found and deleted, false if the email had no access (or the
   * folder is already gone). Never deletes an `owner` grant.
   *
   * Idempotent: safe to call when no share exists (returns false).
   */
  async revokeFolderAccess(folderId: string, email: string): Promise<boolean> {
    const target = email.trim().toLowerCase();
    if (!target) return false;
    try {
      const { drive } = this.getDrive();
      const perms = await this.listFolderPermissions(folderId);
      const match = perms.find(
        p => p.emailAddress.toLowerCase() === target && p.role !== 'owner',
      );
      if (!match) return false;
      await drive.permissions.delete({
        fileId: folderId,
        permissionId: match.id,
        supportsAllDrives: true,
      });
      this.logger.log(`revokeFolderAccess: removed ${email} from folder ${folderId}`);
      return true;
    } catch (error: any) {
      const status = error?.code ?? error?.response?.status;
      // Folder or permission already gone — treat as already-revoked.
      if (status === 404) return false;
      this.logger.error(
        `revokeFolderAccess failed (folderId=${folderId}, email=${email}): ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException('Failed to revoke Drive folder access');
    }
  }
}
