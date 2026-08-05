import PDFDocument = require('pdfkit');
import { PnLReportDto } from './dtos/pnl-report.dto';
import { drawRtl, fmtDate, fmtMoney, registerHebrewFonts, stampFooterOnAllPages } from './pdf-shared';

export interface PnLReportPdfMeta {
  businessName: string;
  businessNumber: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Render a P&L report PDF (RTL, Hebrew) — same authoring approach as the VAT
 * report (pdfkit, server-rendered), rather than an external template-fill
 * service. Returns the file as a Buffer.
 */
export function buildPnlReportPdf(
  data: PnLReportDto,
  meta: PnLReportPdfMeta,
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
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 20;

      // drawRtl positions each word itself (lineBreak: false) and never
      // touches doc.y, so every line here advances doc.y by an explicit
      // amount instead of relying on pdfkit's automatic text-flow height.
      let y = doc.y;

      // Title (right) + generation date (left)
      doc.font(fontB).fontSize(22);
      drawRtl(doc, 'דו"ח רווח והפסד', pageLeft, y, contentWidth, { align: 'right' });
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
      y += 26;

      // Divider
      doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor('#cccccc').stroke();
      y += 20;
      doc.y = y;

      const rowHeight = 26;
      const totalExpenses = (data.expenses ?? []).reduce((s, e) => s + (Number(e.total) || 0), 0);

      const drawRow = (label: string, value: number, opts: { emphasize?: boolean; negative?: boolean } = {}) => {
        if (doc.y + rowHeight > bottomLimit) {
          doc.addPage();
          doc.y = doc.page.margins.top;
        }
        const rowY = doc.y;
        const font = opts.emphasize ? fontB : fontR;
        const size = opts.emphasize ? 14 : 12;
        const signedValue = opts.negative ? -Math.abs(value) : value;

        if (opts.emphasize) {
          doc.rect(pageLeft, rowY - 4, contentWidth, rowHeight).fillColor('#f3f6e8').fill();
          doc.fillColor('#000000');
        }

        doc.font(font).fontSize(size).fillColor('#000000');
        drawRtl(doc, label, pageLeft, rowY + 4, contentWidth, { align: 'right' });
        doc
          .font(font)
          .fontSize(size)
          .text(fmtMoney(signedValue), pageLeft, rowY + 4, { width: contentWidth, align: 'left' });

        doc.y = rowY + rowHeight;
      };

      drawRow('סך הכל הכנסות לפני מע"מ', Number(data.income) || 0);

      // Separate the income section from the expense breakdown below it.
      const dividerY = doc.y + 6;
      doc.moveTo(pageLeft, dividerY).lineTo(pageRight, dividerY).strokeColor('#cccccc').stroke();
      doc.y = dividerY + 14;

      for (const expense of data.expenses ?? []) {
        drawRow(expense.sectionName, Number(expense.total) || 0, { negative: true });
      }
      drawRow('סך הכל הוצאות', totalExpenses, { negative: true });

      // Separate the expense total from the net-profit summary below it.
      const netProfitDividerY = doc.y + 6;
      doc.moveTo(pageLeft, netProfitDividerY).lineTo(pageRight, netProfitDividerY).strokeColor('#cccccc').stroke();
      doc.y = netProfitDividerY + 14;

      drawRow('רווח נקי לפני מס', Number(data.netProfitBeforeTax) || 0, { emphasize: true });

      stampFooterOnAllPages(doc, fontR);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
