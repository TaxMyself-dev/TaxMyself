import {
  Body,
  Controller,
  HttpCode,
  InternalServerErrorException,
  Logger,
  NotAcceptableException,
  NotFoundException,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { DocumentImportService } from 'src/document-import/document-import.service';
import { DocumentImportSource } from 'src/document-import/enums/document-import.enums';
import { MailgunSignatureService } from './mailgun-signature.service';

interface MailgunInboundBody {
  timestamp?: string;
  token?: string;
  signature?: string;
  recipient?: string;
  sender?: string;
  from?: string;
  subject?: string;
  attachments?: string;
  'message-url'?: string;
}

interface SpikeImportSummary {
  accepted: true;
  receivedFiles: number;
  imported: number;
  duplicates: number;
  ignored: number;
}

/**
 * Mailgun inbound vertical spike.
 *
 * The endpoint is deliberately mapped to one configured recipient/business.
 * It proves DNS -> Mailgun route -> signed multipart webhook -> shared Drive
 * intake without committing to the full address/event/worker data model yet.
 */
@Controller('webhooks/mailgun')
export class MailgunInboundController {
  private readonly logger = new Logger(MailgunInboundController.name);

  constructor(
    private readonly signatureService: MailgunSignatureService,
    private readonly documentImportService: DocumentImportService,
  ) {}

  @Post('inbound')
  @HttpCode(200)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: {
        files: 10,
        fileSize: 20 * 1024 * 1024,
        fields: 50,
      },
    }),
  )
  async receive(
    @Body() body: MailgunInboundBody,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ): Promise<SpikeImportSummary> {
    this.assertSpikeEnabled();
    this.signatureService.assertValid(body);

    const expectedRecipient = this.requiredEnv(
      'MAILGUN_INBOUND_SPIKE_RECIPIENT',
    );
    const recipient = this.normalizeEmail(body.recipient);
    if (recipient !== this.normalizeEmail(expectedRecipient)) {
      // 406 tells Mailgun that retrying this route payload is not useful.
      throw new NotAcceptableException('Unknown Mailgun spike recipient');
    }

    const firebaseId = this.requiredEnv('MAILGUN_INBOUND_SPIKE_FIREBASE_ID');
    const businessNumber = this.requiredEnv(
      'MAILGUN_INBOUND_SPIKE_BUSINESS_NUMBER',
    );
    const candidates = files
      .map((file) => ({
        file,
        filename: this.decodeAttachmentFilename(file.originalname),
      }))
      .filter(({ file, filename }) =>
        this.isSupportedDocument(file, filename),
      );

    let imported = 0;
    let duplicates = 0;
    const failures: string[] = [];
    for (const { file, filename } of candidates) {
      const result = await this.documentImportService.importDocument({
        firebaseId,
        businessNumber,
        source: DocumentImportSource.EMAIL_FORWARDING,
        filename,
        mimeType: file.mimetype || null,
        content: file.buffer,
      });
      if (result.status === 'IMPORTED') imported += 1;
      if (result.status === 'ALREADY_IMPORTED') duplicates += 1;
      if (result.status === 'SKIPPED') {
        failures.push(
          `${filename}: ${result.reason ?? 'unknown failure'}`,
        );
      }
    }

    this.logger.log(
      `Mailgun spike accepted: files=${files.length} candidates=${candidates.length} ` +
        `imported=${imported} duplicates=${duplicates}`,
    );

    // A retry is safe because DocumentImportService deduplicates by content.
    if (failures.length > 0) {
      this.logger.error(`Mailgun spike import failed: ${failures.join('; ')}`);
      throw new InternalServerErrorException(
        'Mailgun attachment import failed',
      );
    }

    return {
      accepted: true,
      receivedFiles: files.length,
      imported,
      duplicates,
      ignored: files.length - candidates.length,
    };
  }

  private assertSpikeEnabled(): void {
    if (process.env.MAILGUN_INBOUND_SPIKE_ENABLED !== 'true') {
      throw new NotFoundException();
    }
  }

  private requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new InternalServerErrorException(`${name} is not configured`);
    }
    return value;
  }

  private normalizeEmail(value: string | undefined): string {
    return String(value ?? '')
      .trim()
      .toLowerCase();
  }

  /**
   * Busboy/Multer interprets multipart header filenames as latin1. Mailgun
   * sends UTF-8 bytes there, so a Hebrew filename can arrive as
   * "×\u0097×©...". Only accept the UTF-8 repair when it round-trips
   * losslessly; already-correct Unicode filenames must remain untouched.
   */
  private decodeAttachmentFilename(value: string | undefined): string {
    const filename = String(value ?? '').trim();
    if (!filename) return 'attachment';

    const decoded = Buffer.from(filename, 'latin1').toString('utf8');
    const roundTrip = Buffer.from(decoded, 'utf8').toString('latin1');
    return !decoded.includes('\uFFFD') && roundTrip === filename
      ? decoded
      : filename;
  }

  private isSupportedDocument(
    file: Express.Multer.File,
    decodedFilename = file.originalname ?? '',
  ): boolean {
    const mime = (file.mimetype ?? '').toLowerCase();
    const name = decodedFilename.toLowerCase();
    return (
      (mime === 'application/pdf' && name.endsWith('.pdf')) ||
      (mime === 'image/jpeg' &&
        (name.endsWith('.jpg') || name.endsWith('.jpeg'))) ||
      (mime === 'image/png' && name.endsWith('.png'))
    );
  }
}
