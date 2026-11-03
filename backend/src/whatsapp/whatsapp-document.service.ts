import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  DocumentImportRequest,
  DocumentImportResult,
} from '../document-import/document-import.service';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
import { normalizeWhatsappPhone } from './whatsapp-development.config';
import {
  WhatsappRoutingService,
  RoutingResult,
} from './whatsapp-routing.service';

export const WHATSAPP_DOCUMENT_IMPORTER = Symbol('WHATSAPP_DOCUMENT_IMPORTER');
export interface WhatsappDocumentImporter {
  importDocument(request: DocumentImportRequest): Promise<DocumentImportResult>;
}
export interface SimulatedDocumentMessage {
  messageId: string;
  from: string;
  businessNumber?: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
}
export interface DocumentMessageResult {
  status:
    | RoutingResult['status']
    | 'IMPORTED'
    | 'ALREADY_IMPORTED'
    | 'IMPORT_FAILED'
    | 'DUPLICATE_MESSAGE';
  businesses?: string[];
  businessNumber?: string;
  driveFileId?: string;
  retryable?: boolean;
  reply?: string;
  originalStatus?: string;
}

export const MAX_WHATSAPP_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Synchronous development intake. No durable queue or live webhook is claimed. */
@Injectable()
export class WhatsappDocumentService {
  private readonly messages = new Map<
    string,
    { fingerprint: string; result: Promise<DocumentMessageResult> }
  >();
  constructor(
    private readonly routing: WhatsappRoutingService,
    @Inject(WHATSAPP_DOCUMENT_IMPORTER)
    private readonly importer: WhatsappDocumentImporter,
  ) {}

  async receive(
    body: SimulatedDocumentMessage,
  ): Promise<DocumentMessageResult> {
    if (
      !body ||
      typeof body.messageId !== 'string' ||
      !/^[A-Za-z0-9_.:-]{1,200}$/.test(body.messageId)
    ) {
      throw new BadRequestException(
        'messageId must be 1-200 identifier characters',
      );
    }
    const target = this.routing.resolve(body.from, body.businessNumber);
    if (target.status !== 'READY') {
      return {
        status: target.status,
        ...(target.businesses ? { businesses: target.businesses } : {}),
      };
    }
    const content = validateDocument(body);
    const filename = body.filename
      .replace(/[\\/\u0000-\u001f\u007f]/g, '-')
      .trim();
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          normalizeWhatsappPhone(body.from),
          target.firebaseId,
          target.businessNumber,
          filename,
          body.mimeType,
          createHash('sha256').update(content).digest('hex'),
        ]),
      )
      .digest('hex');
    const existing = this.messages.get(body.messageId);
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new ConflictException(
          'messageId already belongs to a different payload',
        );
      const result = await existing.result;
      return result.status === 'IMPORT_FAILED'
        ? result
        : {
            ...result,
            status: 'DUPLICATE_MESSAGE',
            originalStatus: result.status,
          };
    }
    if (this.messages.size >= 1000)
      throw new ServiceUnavailableException(
        'Development event capacity reached; restart the sandbox',
      );
    // Reserve before starting work so concurrent deliveries share one import.
    const result = Promise.resolve().then(() =>
      this.import(body, filename, content, target),
    );
    this.messages.set(body.messageId, { fingerprint, result });
    const completed = await result;
    if (completed.status === 'IMPORT_FAILED')
      this.messages.delete(body.messageId);
    return completed;
  }

  private async import(
    body: SimulatedDocumentMessage,
    filename: string,
    content: Buffer,
    target: RoutingResult,
  ): Promise<DocumentMessageResult> {
    try {
      const result = await this.importer.importDocument({
        firebaseId: target.firebaseId,
        businessNumber: target.businessNumber,
        // Development only: preserve existing MySQL enum, no schema mutation.
        source: DocumentImportSource.API_IMPORT,
        filename,
        mimeType: body.mimeType,
        content,
      });
      if (result.status === 'SKIPPED' || !result.driveFileId)
        return this.failed();
      return {
        status: result.status,
        businessNumber: target.businessNumber,
        driveFileId: result.driveFileId,
        reply:
          result.status === 'IMPORTED'
            ? 'המסמך התקבל ונשמר בתיקיית העסק.'
            : 'המסמך כבר קיים בתיקיית העסק.',
      };
    } catch {
      // Never echo OAuth/DB error messages or file contents to the HTTP client.
      return this.failed();
    }
  }

  private failed(): DocumentMessageResult {
    return {
      status: 'IMPORT_FAILED',
      retryable: true,
      reply: 'המסמך לא נשמר. אפשר לנסות לשלוח שוב.',
    };
  }
}

function validateDocument(body: SimulatedDocumentMessage): Buffer {
  if (
    typeof body.filename !== 'string' ||
    !body.filename.trim() ||
    body.filename.length > 200
  ) {
    throw new BadRequestException('filename must be 1-200 characters');
  }
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(body.mimeType)) {
    throw new BadRequestException('Only PDF, JPEG and PNG are supported');
  }
  const encoded = body.contentBase64;
  if (
    typeof encoded !== 'string' ||
    !encoded.length ||
    encoded.length > Math.ceil(MAX_WHATSAPP_DOCUMENT_BYTES / 3) * 4 ||
    encoded.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
  ) {
    throw new BadRequestException(
      'Expected a nonempty base64 file of at most 10 MiB',
    );
  }
  const content = Buffer.from(encoded, 'base64');
  if (
    !content.length ||
    content.length > MAX_WHATSAPP_DOCUMENT_BYTES ||
    content.toString('base64') !== encoded
  ) {
    throw new BadRequestException('Invalid base64 file or size');
  }
  const matches =
    body.mimeType === 'application/pdf'
      ? content.subarray(0, 5).toString('ascii') === '%PDF-'
      : body.mimeType === 'image/png'
      ? content
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : content.length >= 3 &&
        content[0] === 255 &&
        content[1] === 216 &&
        content[2] === 255;
  if (!matches)
    throw new BadRequestException(
      'File header does not match declared MIME type',
    );
  return content;
}
