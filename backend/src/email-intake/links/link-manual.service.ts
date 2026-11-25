import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmailIntakeStore, EmailRun, EmailItem } from '../email-intake.store';
import { EmailIntakeStorage } from '../email-intake.storage';
import { EmailRoutingService } from '../email-routing.service';
import { emailRunScope } from '../email-worker-scope';
import { LinkDownloader } from './link-downloader.service';
import { publicLink } from './link-policy';

const metadata = (row: any) =>
  typeof row.source_metadata_json === 'string'
    ? JSON.parse(row.source_metadata_json)
    : row.source_metadata_json || {};
@Injectable()
export class LinkManualService {
  constructor(
    readonly store: EmailIntakeStore,
    readonly storage: EmailIntakeStorage,
    readonly routing: EmailRoutingService,
    readonly downloader: LinkDownloader,
  ) {}
  private async ownedBusiness(owner: string, business: string) {
    if (
      typeof business !== 'string' ||
      !business ||
      business.length > 32 ||
      !(await this.routing.ownedBusinesses(owner)).some(
        (b) => b.businessNumber === business,
      )
    )
      throw new NotFoundException('Business not found');
  }
  async list(owner: string, business: string, cursor = '') {
    await this.ownedBusiness(owner, business);
    if (cursor && !/^[a-f\d-]{36}$/i.test(cursor))
      throw new BadRequestException('Invalid cursor');
    const scope = emailRunScope(this.store.workerScope, 'r.worker_scope');
    const rows = await this.store.query(
      "SELECT i.*,r.integration_id FROM email_import_items i JOIN email_import_runs r ON r.id=i.run_id WHERE r.firebase_id=? AND i.part_path LIKE 'link:%' AND i.state='BLOCKED' AND (r.lease_token IS NULL OR r.lease_expires_at<UTC_TIMESTAMP(3)) AND i.id>?" +
        scope.sql +
        ' ORDER BY i.id LIMIT 101',
      [owner, cursor, ...scope.params],
    );
    const items = [];
    for (const row of rows.slice(0, 100)) {
      const meta = metadata(row);
      try {
        const route = await this.routing.initial(
          owner,
          row.integration_id,
          meta.gmailFrom,
        );
        if (route.initialBusiness !== business) continue;
        await this.routing.assertAllowed(
          owner,
          row.integration_id,
          meta.gmailFrom,
        );
        publicLink(meta.documentLink);
        items.push({
          id: row.id,
          name: meta.documentLinkLabel || 'מסמך מקישור במייל',
          subject: meta.gmailSubject || null,
          from: meta.gmailFrom || null,
          date: meta.gmailDate || null,
          reason: row.error_code || 'LINK_MANUAL_REQUIRED',
        });
      } catch {}
    }
    return { items, nextCursor: rows.length > 100 ? rows[99].id : null };
  }
  private async source(
    owner: string,
    id: string,
    business: string,
    runner: any,
  ) {
    const scope = emailRunScope(this.store.workerScope, 'r.worker_scope');
    const rows = await runner.query(
      "SELECT i.*,r.firebase_id,r.business_number,r.integration_id,r.lease_token AS run_lease,r.lease_expires_at AS run_lease_expires FROM email_import_items i JOIN email_import_runs r ON r.id=i.run_id WHERE i.id=? AND r.firebase_id=? AND i.part_path LIKE 'link:%'" +
        scope.sql,
      [id, owner, ...scope.params],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Document link not found');
    const meta = metadata(row);
    await this.routing.assertAllowed(owner, row.integration_id, meta.gmailFrom);
    const route = await this.routing.initial(
      owner,
      row.integration_id,
      meta.gmailFrom,
    );
    if (route.initialBusiness !== business)
      throw new NotFoundException('Document link not found');
    if (row.run_lease && new Date(row.run_lease_expires).getTime() > Date.now())
      throw new ConflictException('Download still in progress');
    return row;
  }
  async original(owner: string, id: string, business: string) {
    await this.ownedBusiness(owner, business);
    const runner = this.store.db.createQueryRunner();
    await runner.connect();
    try {
      const row = await this.source(owner, id, business, runner);
      return publicLink(metadata(row).documentLink).href;
    } finally {
      await runner.release();
    }
  }
  async replace(
    owner: string,
    id: string,
    business: string,
    file: Express.Multer.File,
  ) {
    await this.ownedBusiness(owner, business);
    if (!file?.buffer) throw new BadRequestException('PDF file required');
    try {
      await this.downloader.checked(file.buffer);
    } catch {
      throw new BadRequestException('A valid PDF is required');
    }
    const runner = this.store.db.createQueryRunner();
    let locked = false;
    await runner.connect();
    try {
      locked =
        Number(
          (
            await runner.query('SELECT GET_LOCK(?,0) AS acquired', [
              'email-link-' + id,
            ])
          )[0]?.acquired,
        ) === 1;
      if (!locked) throw new ConflictException('Document upload in progress');
      const row = await this.source(owner, id, business, runner);
      if (['IMPORTED', 'DUPLICATE'].includes(row.state)) {
        await this.store.refreshRun({ id: row.run_id } as EmailRun);
        return { accepted: true, alreadyHandled: true };
      }
      if (row.state !== 'BLOCKED')
        throw new ConflictException('Document is not waiting for upload');
      const run = {
        id: row.run_id,
        firebase_id: owner,
        business_number: business,
        integration_id: row.integration_id,
      } as EmailRun;
      const item = {
        ...row,
        filename: (file.originalname || 'uploaded-document.pdf')
          .replace(/[\\/\x00-\x1f]/g, '-')
          .slice(0, 500),
        mime_type: 'application/pdf',
      } as EmailItem;
      const result = await this.storage.accept(run, item, file.buffer);
      const saved = await runner.query(
        "UPDATE email_import_items i JOIN email_import_runs r ON r.id=i.run_id SET i.state=?,i.imported_document_id=?,i.error_code=NULL WHERE i.id=? AND r.firebase_id=? AND i.state='BLOCKED'",
        [result.duplicate ? 'DUPLICATE' : 'IMPORTED', result.id, id, owner],
      );
      if (saved.affectedRows !== 1)
        throw new ConflictException('Document state changed');
      await this.store.refreshRun(run);
      return { accepted: true, alreadyHandled: false };
    } finally {
      try {
        if (locked)
          await runner.query('SELECT RELEASE_LOCK(?)', ['email-link-' + id]);
      } finally {
        await runner.release();
      }
    }
  }
}
