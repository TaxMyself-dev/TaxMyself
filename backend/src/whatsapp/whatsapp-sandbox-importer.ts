import {
  Controller,
  HttpCode,
  Injectable,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  DocumentImportRequest,
  DocumentImportResult,
  DocumentImportService,
} from '../document-import/document-import.service';
import { WhatsappDevelopmentConfig } from './whatsapp-development.config';
import { WhatsappDevelopmentGuard } from './whatsapp-development.guard';
import { WhatsappDocumentImporter } from './whatsapp-document.service';

/** Real shared import service; only repository and Drive I/O are in memory. */
@Injectable()
export class WhatsappSandboxImporter implements WhatsappDocumentImporter {
  private readonly rows: any[] = [];
  private readonly files = new Map<
    string,
    { id: string; parent: string; name: string }
  >();
  private failUpload = false;
  private nextFileId = 0;
  private readonly importer: DocumentImportService;

  constructor(config: WhatsappDevelopmentConfig) {
    const matches = (row: any, where: any) =>
      Object.entries(where).every(([key, value]) => row[key] === value);
    const repository = {
      findOne: async ({ where }: any) =>
        this.rows.find((row) => matches(row, where)) || null,
      create: (row: any) => ({ ...row }),
      save: async (row: any) => {
        if (
          this.rows.some((r) =>
            matches(r, {
              firebaseId: row.firebaseId,
              businessNumber: row.businessNumber,
              contentHash: row.contentHash,
            }),
          )
        ) {
          throw Object.assign(new Error('duplicate entry'), {
            code: 'ER_DUP_ENTRY',
          });
        }
        const saved = { ...row, id: this.rows.length + 1 };
        this.rows.push(saved);
        return saved;
      },
    };
    const businesses = {
      findOne: async ({ where }: any) =>
        config
          .contacts()
          .some(
            (c) =>
              c.firebaseId === where.firebaseId &&
              c.businesses.includes(where.businessNumber),
          )
          ? {
              ...where,
              driveInboxFolderId: `sandbox-inbox-${where.firebaseId}-${where.businessNumber}`,
            }
          : null,
    };
    const drive = {
      listFolderFiles: async (parent: string) =>
        [...this.files.values()].filter((f) => f.parent === parent),
      uploadFile: async (parent: string, name: string) => {
        if (this.failUpload) {
          this.failUpload = false;
          throw new Error('Simulated upload failure');
        }
        const id = `sandbox-file-${++this.nextFileId}`;
        this.files.set(id, { id, parent, name });
        return id;
      },
      deleteFile: async (id: string) => {
        this.files.delete(id);
      },
    };
    this.importer = new DocumentImportService(
      repository as any,
      businesses as any,
      drive as any,
      null,
    );
  }

  failNextUpload() {
    this.failUpload = true;
    return { status: 'FAILURE_ARMED' };
  }
  importDocument(
    request: DocumentImportRequest,
  ): Promise<DocumentImportResult> {
    return this.importer.importDocument(request);
  }
}

/** Registered exclusively in the standalone sandbox, never in AppModule. */
@Controller('dev/whatsapp/sandbox')
@UseGuards(WhatsappDevelopmentGuard)
export class WhatsappSandboxControlController {
  constructor(private readonly importer: WhatsappSandboxImporter) {}
  @Post('fail-next-upload')
  @HttpCode(200)
  failNext() {
    return this.importer.failNextUpload();
  }
}
