import { gmail_v1 } from 'googleapis';
import {
  hebrewTextPdf,
  latinTextPdf,
  malformedPdf,
  scannedPdf,
} from '../../../test/fixtures/pdf-fixtures';
import { UserIntegration } from '../entities/user-integration.entity';
import { IntegrationStatus } from '../enums/integrations.enums';
import {
  GmailPdfScanOutcome,
  GmailSkipReason,
  PdfContentScanAccumulator,
  SkippedAttachmentsAccumulator,
} from '../utils/gmail-sync-logging.util';

// Wraps the REAL extractor so the tests exercise genuine PDF parsing while
// still being able to assert that it was never reached for files the
// deterministic checks already rejected.
jest.mock('../utils/pdf-text-extraction.util', () => {
  const actual = jest.requireActual('../utils/pdf-text-extraction.util');
  return { ...actual, extractPdfText: jest.fn(actual.extractPdfText) };
});

import { extractPdfText } from '../utils/pdf-text-extraction.util';
import { GmailReaderService } from './gmail-reader.service';

const extractPdfTextMock = extractPdfText as jest.MockedFunction<
  typeof extractPdfText
>;

// Real PDF parsing is slower than the 5s jest default.
jest.setTimeout(60_000);

const INTEGRATION = {
  id: 1,
  accountEmail: 'user@example.com',
  status: IntegrationStatus.ACTIVE,
  refreshToken: 'encrypted',
  scopes: 'https://www.googleapis.com/auth/gmail.readonly',
} as UserIntegration;

/** An image large enough to clear MIN_IMAGE_BYTES (80 KB). */
const IMAGE_BYTES = Buffer.alloc(100 * 1024, 0x41);

interface TestPart {
  filename: string;
  content: Buffer;
  mimeType?: string;
  /** Overrides the declared body size (defaults to the real byte length). */
  declaredSize?: number;
  inline?: boolean;
}

function buildMessage(
  parts: TestPart[],
  subject: string | null,
  snippet: string | null,
) {
  return {
    threadId: 'thread-1',
    snippet,
    payload: {
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: 'sender@example.com' },
        { name: 'Date', value: 'Mon, 1 Jun 2026 10:00:00 +0300' },
      ],
      parts: parts.map((part, index) => ({
        filename: part.filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        body: {
          attachmentId: `att-${index}`,
          size: part.declaredSize ?? part.content.length,
        },
        headers: part.inline
          ? [
              {
                name: 'Content-Disposition',
                value: 'inline; filename="' + part.filename + '"',
              },
            ]
          : [],
      })),
    },
  };
}

describe('GmailReaderService — attachment filtering', () => {
  let service: GmailReaderService;
  let attachmentsGet: jest.Mock;
  let skipStats: SkippedAttachmentsAccumulator;
  let pdfStats: PdfContentScanAccumulator;

  beforeEach(() => {
    extractPdfTextMock.mockClear();
    service = new GmailReaderService({} as any, {} as any);
    skipStats = new SkippedAttachmentsAccumulator();
    pdfStats = new PdfContentScanAccumulator();
  });

  /** Runs one message through the real scan pipeline with a fake Gmail client. */
  async function scanOneMessage(
    parts: TestPart[],
    options: { subject?: string | null; snippet?: string | null } = {},
  ) {
    attachmentsGet = jest.fn(async ({ id }: { id: string }) => {
      const index = Number(id.replace('att-', ''));
      return { data: { data: parts[index].content.toString('base64url') } };
    });

    const gmail = {
      users: {
        messages: {
          list: jest
            .fn()
            .mockResolvedValue({ data: { messages: [{ id: 'msg-1' }] } }),
          get: jest.fn().mockResolvedValue({
            data: buildMessage(
              parts,
              options.subject ?? 'Hello',
              options.snippet ?? 'no signal',
            ),
          }),
          attachments: { get: attachmentsGet },
        },
      },
    } as unknown as gmail_v1.Gmail;

    jest.spyOn(service as any, 'createGmailClient').mockResolvedValue(gmail);

    const results = [];
    for await (const scan of service.scanMessages(INTEGRATION, {
      skipStats,
      pdfStats,
    })) {
      results.push(scan);
    }
    return results[0];
  }

  const skipReasons = () => skipStats.format();
  const pdfOutcomes = () => pdfStats.format();

  // --- existing metadata-based behavior, unchanged ----------------------------

  it('still imports on a filename match, without reading the PDF text', async () => {
    const pdf = await latinTextPdf('Some unrelated body copy');

    const scan = await scanOneMessage([
      { filename: 'invoice-2026-07.pdf', content: pdf },
    ]);

    expect(scan.attachments).toHaveLength(1);
    expect(scan.attachments[0].matchedBy).toBe('filename');
    expect(scan.matchedByPdfContent).toBe(0);
    expect(extractPdfTextMock).not.toHaveBeenCalled();
  });

  it('still imports on a subject match', async () => {
    const pdf = await latinTextPdf('Some unrelated body copy');

    const scan = await scanOneMessage(
      [{ filename: 'doc_00123.pdf', content: pdf }],
      {
        subject: 'חשבונית מס לחודש יוני',
      },
    );

    expect(scan.attachments).toHaveLength(1);
    expect(scan.attachments[0].matchedBy).toBe('subject');
    expect(extractPdfTextMock).not.toHaveBeenCalled();
  });

  it('still imports on a body/snippet match', async () => {
    const pdf = await latinTextPdf('Some unrelated body copy');

    const scan = await scanOneMessage(
      [{ filename: 'doc_00123.pdf', content: pdf }],
      {
        subject: 'Your monthly update',
        snippet: 'Attached is your tax invoice for June.',
      },
    );

    expect(scan.attachments).toHaveLength(1);
    expect(scan.attachments[0].matchedBy).toBe('body');
    expect(extractPdfTextMock).not.toHaveBeenCalled();
  });

  it('leaves JPG/JPEG/PNG behavior untouched — no keyword means no download', async () => {
    const scan = await scanOneMessage([
      { filename: 'photo.jpg', content: IMAGE_BYTES, mimeType: 'image/jpeg' },
      { filename: 'photo2.jpeg', content: IMAGE_BYTES, mimeType: 'image/jpeg' },
      { filename: 'photo3.png', content: IMAGE_BYTES, mimeType: 'image/png' },
    ]);

    expect(scan.attachments).toHaveLength(0);
    expect(scan.skippedIrrelevant).toBe(3);
    expect(attachmentsGet).not.toHaveBeenCalled();
    expect(extractPdfTextMock).not.toHaveBeenCalled();
    expect(skipReasons()).toContain(GmailSkipReason.NOT_INVOICE_OR_RECEIPT);
  });

  it('still imports an image when the metadata names a document', async () => {
    const scan = await scanOneMessage(
      [
        {
          filename: 'receipt.jpg',
          content: IMAGE_BYTES,
          mimeType: 'image/jpeg',
        },
      ],
      { subject: 'Your receipt' },
    );

    expect(scan.attachments).toHaveLength(1);
    expect(scan.attachments[0].matchedBy).toBe('filename');
    expect(extractPdfTextMock).not.toHaveBeenCalled();
  });

  // --- new: PDF content fallback ----------------------------------------------

  it('imports a generically named PDF containing "חשבונית מס/קבלה" in its text', async () => {
    const pdf = await hebrewTextPdf('חשבונית מס/קבלה 4432 לתאריך 01/06/2026');

    const scan = await scanOneMessage(
      [{ filename: 'doc_00123.pdf', content: pdf }],
      {
        subject: 'Message from your supplier',
        snippet: 'See attached',
      },
    );

    expect(scan.attachments).toHaveLength(1);
    expect(scan.attachments[0].matchedBy).toBe('pdf-content');
    expect(scan.matchedByPdfContent).toBe(1);
    expect(pdfOutcomes()).toContain(GmailPdfScanOutcome.MATCHED);
  });

  it('imports a generically named English PDF containing "tax invoice"', async () => {
    const pdf = await latinTextPdf(
      'ACME Ltd — Tax Invoice No. 5590 — total 1,250.00',
    );

    const scan = await scanOneMessage(
      [{ filename: 'file-9981.pdf', content: pdf }],
      {
        subject: 'Your document',
        snippet: 'See attached',
      },
    );

    expect(scan.attachments).toHaveLength(1);
    expect(scan.attachments[0].matchedBy).toBe('pdf-content');
    expect(scan.matchedByPdfContent).toBe(1);
  });

  it('downloads a content-rescued attachment exactly once', async () => {
    const pdf = await latinTextPdf('ACME Ltd — Tax Invoice No. 5590');

    const scan = await scanOneMessage([
      { filename: 'file-9981.pdf', content: pdf },
    ]);

    expect(scan.attachments).toHaveLength(1);
    expect(attachmentsGet).toHaveBeenCalledTimes(1);
    // The buffer handed downstream is the one that was already downloaded.
    expect(scan.attachments[0].content.equals(pdf)).toBe(true);
  });

  it('keeps the existing skip when a text PDF names no accounting document', async () => {
    const pdf = await latinTextPdf(
      'Monthly newsletter — product updates and company news',
    );

    const scan = await scanOneMessage([
      { filename: 'file-9981.pdf', content: pdf },
    ]);

    expect(scan.attachments).toHaveLength(0);
    expect(scan.skippedIrrelevant).toBe(1);
    expect(skipReasons()).toContain(GmailSkipReason.NOT_INVOICE_OR_RECEIPT);
    expect(pdfOutcomes()).toContain(GmailPdfScanOutcome.NO_KEYWORD);
  });

  it('does not let weak generic words rescue a PDF', async () => {
    const pdf = await latinTextPdf(
      'Payment total amount due: 1,250. Thank you for your custom.',
    );

    const scan = await scanOneMessage(
      [{ filename: 'file-9981.pdf', content: pdf }],
      {
        subject: 'Payment total',
        snippet: 'amount due',
      },
    );

    expect(scan.attachments).toHaveLength(0);
    expect(skipReasons()).toContain(GmailSkipReason.NOT_INVOICE_OR_RECEIPT);
    expect(pdfOutcomes()).toContain(GmailPdfScanOutcome.NO_KEYWORD);
  });

  it('keeps the existing skip for a scanned PDF with no extractable text', async () => {
    const pdf = await scannedPdf();

    const scan = await scanOneMessage([
      { filename: 'scan_0001.pdf', content: pdf },
    ]);

    expect(scan.attachments).toHaveLength(0);
    expect(scan.skippedIrrelevant).toBe(1);
    expect(skipReasons()).toContain(GmailSkipReason.NOT_INVOICE_OR_RECEIPT);
    expect(pdfOutcomes()).toContain(GmailPdfScanOutcome.NO_TEXT);
  });

  it('a malformed PDF is contained — the rest of the message still imports', async () => {
    const broken = malformedPdf();
    const good = await latinTextPdf('unrelated');

    const scan = await scanOneMessage([
      { filename: 'file-0001.pdf', content: broken },
      { filename: 'invoice-77.pdf', content: good },
    ]);

    expect(scan.failed).toBe(false);
    expect(scan.attachments).toHaveLength(1);
    expect(scan.attachments[0].filename).toBe('invoice-77.pdf');
    expect(pdfOutcomes()).toContain(GmailPdfScanOutcome.FAILED);
    expect(skipReasons()).toContain(GmailSkipReason.NOT_INVOICE_OR_RECEIPT);
  });

  // --- technical skips still win, and short-circuit before extraction ----------

  it('never extracts text from an unsupported file type', async () => {
    const scan = await scanOneMessage([
      { filename: 'report.docx', content: Buffer.alloc(60 * 1024, 0x41) },
    ]);

    expect(scan.attachments).toHaveLength(0);
    expect(attachmentsGet).not.toHaveBeenCalled();
    expect(extractPdfTextMock).not.toHaveBeenCalled();
    expect(skipReasons()).toContain(GmailSkipReason.UNSUPPORTED_EXTENSION);
  });

  it('never extracts text from an inline or signature asset', async () => {
    const signature = await latinTextPdf(
      'Tax Invoice — this must never be reached',
    );

    const scan = await scanOneMessage([
      { filename: 'signature.pdf', content: signature },
      {
        filename: 'image001.png',
        content: IMAGE_BYTES,
        mimeType: 'image/png',
        inline: true,
      },
    ]);

    expect(scan.attachments).toHaveLength(0);
    expect(attachmentsGet).not.toHaveBeenCalled();
    expect(extractPdfTextMock).not.toHaveBeenCalled();
    expect(skipReasons()).toContain(GmailSkipReason.ASSET_FILENAME);
    expect(skipReasons()).toContain(GmailSkipReason.INLINE_ASSET);
  });

  it('never extracts text from a PDF below the minimum size', async () => {
    const scan = await scanOneMessage([
      { filename: 'file-0001.pdf', content: Buffer.from('%PDF-1.4 tiny') },
    ]);

    expect(scan.attachments).toHaveLength(0);
    expect(extractPdfTextMock).not.toHaveBeenCalled();
    expect(skipReasons()).toContain(GmailSkipReason.PDF_TOO_SMALL);
  });

  it('never extracts text from a payload that is not really a PDF', async () => {
    const scan = await scanOneMessage([
      { filename: 'file-0001.pdf', content: Buffer.alloc(40 * 1024, 0x41) },
    ]);

    expect(scan.attachments).toHaveLength(0);
    expect(extractPdfTextMock).not.toHaveBeenCalled();
    expect(skipReasons()).toContain(GmailSkipReason.PDF_INVALID);
  });
});
