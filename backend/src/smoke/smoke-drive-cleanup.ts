import type { drive_v3 } from 'googleapis';

/** Every target is validated before deleting any exact-run folder. */
export class SmokeDriveFolderCleanup {
  constructor(private readonly drive: Pick<drive_v3.Drive, 'files'>, private readonly rootFolderId: string) {}

  async deleteUserFolder(name: string, waitForProvisioning: boolean, settleMs = 60_000): Promise<boolean> {
    if (!/^Keepintax Smoke[a-z]{12,32}$/.test(name) || !this.rootFolderId) {
      throw new Error('Invalid guarded smoke folder target');
    }
    if (!Number.isFinite(settleMs) || settleMs < 0 || settleMs > 60_000) {
      throw new Error('SMOKE_DRIVE_SETTLE_MS must be between 0 and 60000');
    }
    const deadline = Date.now() + settleMs;
    let files: drive_v3.Schema$File[];
    do {
      files = [];
      let pageToken: string | undefined;
      do {
        const response = await this.drive.files.list({
          q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and '${this.rootFolderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
          fields: 'nextPageToken,files(id,name,mimeType,parents,trashed)',
          pageSize: 20, pageToken, spaces: 'drive', supportsAllDrives: true, includeItemsFromAllDrives: true,
        });
        files.push(...(response.data.files ?? []));
        if (files.length > 20 || (response.data.nextPageToken && !response.data.files?.length)) {
          throw new Error('Smoke folder lookup exceeded its guarded bound');
        }
        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);
      if (files.length || !waitForProvisioning || Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (true);

    for (const file of files) {
      if (!file.id || file.id === this.rootFolderId || file.name !== name || file.trashed ||
          file.mimeType !== 'application/vnd.google-apps.folder' || !file.parents?.includes(this.rootFolderId)) {
        throw new Error('Drive returned a folder outside the exact guarded smoke target');
      }
    }
    for (const file of files) {
      try { await this.drive.files.delete({ fileId: file.id!, supportsAllDrives: true }); }
      catch (error: any) {
        if ((error?.code ?? error?.response?.status) !== 404) throw error;
      }
    }
    return files.length > 0;
  }
}
