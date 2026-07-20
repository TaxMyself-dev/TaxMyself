import PDFDocument = require('pdfkit');
import { VatReportDto } from './dtos/vat-report.dto';
import { drawRtl, fmtDate, fmtMoney, registerHebrewFonts, stampFooterOnAllPages } from './pdf-shared';

export interface VatReportPdfExpenseRow {
  supplier: string;
  date: string;
  sum: number;
  subCategory: string;
  totalVatPayable: number;
  /** `vatPercentSnapshot` off the expense — the recognized-for-VAT percentage shown under the ₪ amount. */
  vatPercent: number;
}

export interface VatReportPdfMeta {
  businessName: string;
  businessNumber: string;
  periodStart: Date;
  periodEnd: Date;
  /** When the report was marked submitted — stamped on the PDF as the as-filed date.
   *  Only set for the submitted-report snapshot; the interactive export omits it. */
  submittedAt?: Date;
  /** Expense line items for the "פירוט ההוצאות" section — interactive export only. */
  expenses?: VatReportPdfExpenseRow[];
}

const fmtPlain = (n: number): string => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US');

const VAT_LABELS: { key: keyof VatReportDto | 'vatOnVatableTurnover'; label: string; emphasize?: boolean }[] = [
  { key: 'vatableTurnover', label: 'עסקאות חייבות' },
  { key: 'vatOnVatableTurnover', label: 'סה"כ מע"מ' },
  { key: 'nonVatableTurnover', label: 'עסקאות פטורות או בשיעור אפס' },
  { key: 'vatRefundOnAssets', label: 'תשומות ציוד' },
  { key: 'vatRefundOnExpenses', label: 'תשומות אחרות' },
  { key: 'vatPayment', label: 'סה"כ לתשלום', emphasize: true },
];

const EXPENSE_COLUMNS: { key: keyof VatReportPdfExpenseRow; label: string; width: number; money?: boolean }[] = [
  { key: 'supplier', label: 'ספק', width: 0.28 },
  { key: 'date', label: 'תאריך', width: 0.14 },
  { key: 'subCategory', label: 'סיווג', width: 0.22 },
  { key: 'sum', label: 'סה"כ כולל מע"מ', width: 0.18, money: true },
  { key: 'totalVatPayable', label: 'מוכר למע"מ', width: 0.18, money: true },
];

/**
 * Render a VAT report PDF (RTL, Hebrew). Used both for the as-filed
 * submitted-report snapshot (meta.submittedAt set, no expense breakdown) and
 * the interactive "export" button (meta.expenses set, no submittedAt).
 * Returns the file as a Buffer so the caller can upload it to storage or
 * stream it straight back to the client.
 */
export function buildVatReportPdf(
  data: VatReportDto,
  meta: VatReportPdfMeta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { fontR, fontB } = registerHebrewFonts(doc);

      const pageRight = doc.page.width - doc.page.margins.right;
      const pageLeft = doc.page.margins.left;
      const contentWidth = pageRight - pageLeft;

      // drawRtl positions each word itself (lineBreak: false) and never
      // touches doc.y, so every line here advances doc.y by an explicit
      // amount instead of relying on pdfkit's automatic text-flow height.
      let y = doc.y;

      // Title (right) + generation date (left)
      doc.font(fontB).fontSize(22);
      drawRtl(doc, 'דו"ח מע"מ', pageLeft, y, contentWidth, { align: 'right' });
      doc.font(fontR).fontSize(9).fillColor('#888888');
      drawRtl(doc, `תאריך הפקה: ${fmtDate(new Date())}`, pageLeft, y + 7, contentWidth, { align: 'left' });
      doc.fillColor('#000000');
      y += 34;

      // Business + period meta
      doc.font(fontR).fontSize(12);
      drawRtl(doc, `עסק: ${meta.businessName}`, pageLeft, y, contentWidth, { align: 'right' });
      y += 18;
      drawRtl(doc, `מספר עוסק: ${meta.businessNumber}`, pageLeft, y, contentWidth, { align: 'right' });
      y += 18;
      drawRtl(
        doc,
        `תקופה: ${fmtDate(meta.periodEnd)} – ${fmtDate(meta.periodStart)}`,
        pageLeft,
        y,
        contentWidth,
        { align: 'right' },
      );
      y += 18;
      if (meta.submittedAt) {
        drawRtl(doc, `הוגש בתאריך: ${fmtDate(meta.submittedAt)}`, pageLeft, y, contentWidth, { align: 'right' });
        y += 18;
      }

      y += 8;
      // Divider
      doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor('#cccccc').stroke();
      y += 20;
      doc.y = y;

      // Rows: label on the right, value on the left
      const rowHeight = 30;
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;
      const vatOnVatableTurnover = Number(data.vatableTurnover ?? 0) * Number(data.vatRate ?? 0);
      for (const row of VAT_LABELS) {
        if (doc.y + rowHeight > bottomLimit) {
          doc.addPage();
          doc.y = doc.page.margins.top;
        }
        const rowY = doc.y;
        const value = row.key === 'vatOnVatableTurnover'
          ? vatOnVatableTurnover
          : Number((data as any)[row.key] ?? 0);
        const font = row.emphasize ? fontB : fontR;
        const size = row.emphasize ? 14 : 12;

        if (row.emphasize) {
          doc.rect(pageLeft, rowY - 4, contentWidth, rowHeight).fillColor('#f3f6e8').fill();
          doc.fillColor('#000000');
        }

        doc.font(font).fontSize(size).fillColor('#000000');
        drawRtl(doc, row.label, pageLeft, rowY + 4, contentWidth, { align: 'right' });
        doc
          .font(font)
          .fontSize(size)
          .text(fmtMoney(value), pageLeft, rowY + 4, { width: contentWidth, align: 'left' });

        doc.y = rowY + rowHeight;
      }

      y = doc.y + 20;
      doc.font(fontR).fontSize(10).fillColor('#888888');
      drawRtl(
        doc,
        `שיעור מע"מ: ${Math.round(Number(data.vatRate) * 100)}%`,
        pageLeft,
        y,
        contentWidth,
        { align: 'right' },
      );
      y += 14;
      doc.y = y;

      if (meta.expenses && meta.expenses.length > 0) {
        renderExpenseTable(doc, meta.expenses, { fontR, fontB, pageLeft, pageRight, contentWidth });
      }

      stampFooterOnAllPages(doc, fontR);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Draws the "פירוט ההוצאות" line-item table, paginating as needed. */
function renderExpenseTable(
  doc: any,
  rows: VatReportPdfExpenseRow[],
  ctx: { fontR: string; fontB: string; pageLeft: number; pageRight: number; contentWidth: number },
): void {
  const { fontR, fontB, pageLeft, pageRight, contentWidth } = ctx;
  const bottomLimit = doc.page.height - doc.page.margins.bottom - 20; // leave room for the footer
  const headerHeight = 22;
  // Taller than a single text line because the "מוכר למע"מ" cell stacks the
  // ₪ amount over the recognized percentage.
  const rowHeight = 26;

  const drawHeader = () => {
    let y = doc.y + 16;
    doc.font(fontB).fontSize(14).fillColor('#000000');
    drawRtl(doc, 'פירוט ההוצאות', pageLeft, y, contentWidth, { align: 'right' });
    y += 22;

    doc.rect(pageLeft, y, contentWidth, headerHeight).fillColor('#f4f4f4').fill();
    doc.fillColor('#000000').font(fontB).fontSize(9);
    let x = pageRight;
    for (const col of EXPENSE_COLUMNS) {
      const w = col.width * contentWidth;
      x -= w;
      doc.save();
      doc.rect(x, y, w, headerHeight).clip();
      drawRtl(doc, col.label, x, y + 6, w, { align: 'right' });
      doc.restore();
    }
    doc.y = y + headerHeight;
  };

  drawHeader();

  doc.font(fontR).fontSize(9);
  for (const row of rows) {
    if (doc.y + rowHeight > bottomLimit) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawHeader();
      doc.font(fontR).fontSize(9);
    }
    const y = doc.y;
    let x = pageRight;
    for (const col of EXPENSE_COLUMNS) {
      const w = col.width * contentWidth;
      x -= w;
      const raw = row[col.key];

      // Clip every cell to its own column box — without this, a long
      // supplier/subcategory string overflows past its column's left edge
      // and visually collides with the next cell (drawRtl never clips).
      doc.save();
      doc.rect(x, y, w, rowHeight).clip();

      if (col.key === 'totalVatPayable') {
        doc.font(fontR).fontSize(9).fillColor('#000000');
        doc.text(fmtPlain(Number(raw) || 0), x, y + 3, { width: w, align: 'right', lineBreak: false });
        doc.font(fontR).fontSize(7.5).fillColor('#888888');
        doc.text(`${Math.round(Number(row.vatPercent) || 0)}%`, x, y + 14, { width: w, align: 'right', lineBreak: false });
        doc.fillColor('#000000').fontSize(9);
      } else if (col.money) {
        doc.text(fmtPlain(Number(raw) || 0), x, y + 8, { width: w, align: 'right', lineBreak: false });
      } else {
        drawRtl(doc, String(raw ?? ''), x, y + 8, w, { align: 'right' });
      }

      doc.restore();
    }
    doc
      .moveTo(pageLeft, y + rowHeight)
      .lineTo(pageRight, y + rowHeight)
      .strokeColor('#eeeeee')
      .stroke();
    doc.y = y + rowHeight;
  }
}
