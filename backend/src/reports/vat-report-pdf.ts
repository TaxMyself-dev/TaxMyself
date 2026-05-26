import * as path from 'path';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';
import { VatReportDto } from './dtos/vat-report.dto';

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'Simpler-Regular.otf');
const FONT_BOLD = path.join(FONT_DIR, 'Simpler-Bold.otf');

export interface VatReportPdfMeta {
  businessName: string;
  businessNumber: string;
  periodStart: Date;
  periodEnd: Date;
  /** When the report was marked submitted — stamped on the PDF as the as-filed date. */
  submittedAt: Date;
}

/**
 * pdfkit does not perform BiDi reordering. Our cells are single-direction
 * (Hebrew labels in one column, numbers in another), so reversing the
 * Hebrew runs while leaving digit/Latin runs in place yields correct visual
 * order when the text is drawn left-to-right and right-aligned.
 */
function rtl(input: string): string {
  const tokens = input.match(/[֐-׿יִ-ﭏ"'.,()\-/ ]+|[^֐-׿יִ-ﭏ"'.,()\-/ ]+/g);
  if (!tokens) return input;
  const out: string[] = [];
  for (const t of tokens) {
    // A token is "Hebrew-ish" if it contains at least one Hebrew letter.
    if (/[֐-׿יִ-ﭏ]/.test(t)) {
      out.push([...t].reverse().join(''));
    } else {
      out.push(t);
    }
  }
  return out.reverse().join('');
}

const fmtMoney = (n: number): string =>
  `${Math.round(Number(n) || 0).toLocaleString('en-US')} ₪`;

const fmtDate = (d: Date): string => {
  const dt = new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
};

const VAT_LABELS: { key: keyof VatReportDto; label: string; emphasize?: boolean }[] = [
  { key: 'vatableTurnover', label: 'עסקאות חייבות' },
  { key: 'nonVatableTurnover', label: 'עסקאות פטורות או בשיעור אפס' },
  { key: 'vatRefundOnAssets', label: 'תשומות ציוד' },
  { key: 'vatRefundOnExpenses', label: 'תשומות אחרות' },
  { key: 'vatPayment', label: 'סה"כ לתשלום', emphasize: true },
];

/**
 * Render a one-page VAT report PDF (RTL, Hebrew). Returns the file as a Buffer
 * so the caller can upload it to storage.
 */
export function buildVatReportPdf(
  data: VatReportDto,
  meta: VatReportPdfMeta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const hasFonts = fs.existsSync(FONT_REGULAR) && fs.existsSync(FONT_BOLD);
      if (hasFonts) {
        doc.registerFont('he', FONT_REGULAR);
        doc.registerFont('he-bold', FONT_BOLD);
      }
      const fontR = hasFonts ? 'he' : 'Helvetica';
      const fontB = hasFonts ? 'he-bold' : 'Helvetica-Bold';

      const pageRight = doc.page.width - doc.page.margins.right;
      const pageLeft = doc.page.margins.left;
      const contentWidth = pageRight - pageLeft;

      // Title
      doc
        .font(fontB)
        .fontSize(22)
        .text(rtl('דוח מע"מ'), pageLeft, doc.y, { width: contentWidth, align: 'right' });
      doc.moveDown(0.4);

      // Business + period meta
      doc.font(fontR).fontSize(12);
      doc.text(rtl(`עסק: ${meta.businessName}`), pageLeft, doc.y, {
        width: contentWidth,
        align: 'right',
      });
      doc.text(rtl(`מספר עוסק: ${meta.businessNumber}`), pageLeft, doc.y, {
        width: contentWidth,
        align: 'right',
      });
      doc.text(
        rtl(`תקופה: ${fmtDate(meta.periodStart)} – ${fmtDate(meta.periodEnd)}`),
        pageLeft,
        doc.y,
        { width: contentWidth, align: 'right' },
      );
      doc.text(rtl(`הוגש בתאריך: ${fmtDate(meta.submittedAt)}`), pageLeft, doc.y, {
        width: contentWidth,
        align: 'right',
      });

      doc.moveDown(1);

      // Divider
      doc
        .moveTo(pageLeft, doc.y)
        .lineTo(pageRight, doc.y)
        .strokeColor('#cccccc')
        .stroke();
      doc.moveDown(0.8);

      // Rows: label on the right, value on the left
      const rowHeight = 30;
      for (const row of VAT_LABELS) {
        const y = doc.y;
        const value = Number((data as any)[row.key] ?? 0);
        const font = row.emphasize ? fontB : fontR;
        const size = row.emphasize ? 14 : 12;

        if (row.emphasize) {
          doc
            .rect(pageLeft, y - 4, contentWidth, rowHeight)
            .fillColor('#f3f6e8')
            .fill();
          doc.fillColor('#000000');
        }

        doc
          .font(font)
          .fontSize(size)
          .fillColor('#000000')
          .text(rtl(row.label), pageLeft, y + 4, {
            width: contentWidth,
            align: 'right',
          });
        doc
          .font(font)
          .fontSize(size)
          .text(fmtMoney(value), pageLeft, y + 4, {
            width: contentWidth,
            align: 'left',
          });

        doc.y = y + rowHeight;
      }

      doc.moveDown(1);
      doc
        .font(fontR)
        .fontSize(10)
        .fillColor('#888888')
        .text(rtl(`שיעור מע"מ: ${Math.round(Number(data.vatRate) * 100)}%`), pageLeft, doc.y, {
          width: contentWidth,
          align: 'right',
        });
      doc.text(
        rtl(`הופק על ידי המערכת בתאריך ${fmtDate(new Date())}`),
        pageLeft,
        doc.y,
        { width: contentWidth, align: 'right' },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
