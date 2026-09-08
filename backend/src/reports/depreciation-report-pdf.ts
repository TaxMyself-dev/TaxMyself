import PDFDocument = require('pdfkit');
import { Form1342ReportDto, Form1342ReportRowDto } from './dtos/depreciation-report.dto';
import { drawRtl, PDF_CREATOR_FOOTER, registerHebrewFonts, stampFooterOnAllPages } from './pdf-shared';

export interface DepreciationReportPdfMeta {
  businessName: string;
  taxFileNumber: string;
  year: number;
}

type RowKey = keyof Form1342ReportRowDto;

const COLUMNS: {
  key: RowKey;
  number: number;
  labelLines: string[];
  width: number;
  type: 'text' | 'date' | 'amount' | 'percent';
}[] = [
  { key: 'assetName', number: 1, labelLines: ['שם הנכס', 'ותיאורו'], width: 0.14, type: 'text' },
  { key: 'purchaseDate', number: 2, labelLines: ['תאריך רכישת', 'הנכס'], width: 0.085, type: 'date' },
  { key: 'activationDate', number: 3, labelLines: ['תאריך הפעלת', 'הנכס או השינוי'], width: 0.085, type: 'date' },
  { key: 'originalCost', number: 4, labelLines: ['מחיר', 'מקורי'], width: 0.095, type: 'amount' },
  { key: 'changesDuringYear', number: 5, labelLines: ['שינויים במשך', 'השנה'], width: 0.08, type: 'amount' },
  { key: 'depreciableCost', number: 6, labelLines: ['סה"כ מחיר נכסים', 'בני פחת'], width: 0.10, type: 'amount' },
  { key: 'depreciationRatePerLaw', number: 7, labelLines: ['שיעור הפחת הקבוע', 'עפ"י דין'], width: 0.075, type: 'percent' },
  { key: 'currentYearDepreciation', number: 8, labelLines: ['פחת שנדרש', 'לשנה השוטפת'], width: 0.095, type: 'amount' },
  { key: 'priorYearsDepreciation', number: 9, labelLines: ['סה"כ פחת שנצבר', 'בשנות מס קודמות'], width: 0.095, type: 'amount' },
  { key: 'totalDepreciation', number: 10, labelLines: ['סה"כ', 'פחת'], width: 0.075, type: 'amount' },
  { key: 'remainingBalance', number: 11, labelLines: ['יתרה', 'להפחתה'], width: 0.08, type: 'amount' },
];

const formatAmount = (value: number): string =>
  (Math.round((Number(value) || 0) * 100) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (iso: string): string => {
  const [year, month, day] = String(iso ?? '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : String(iso ?? '');
};

const formatValue = (
  row: Form1342ReportRowDto,
  column: (typeof COLUMNS)[number],
): string => {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '';
  if (column.type === 'date') return formatDate(String(value ?? ''));
  if (column.type === 'amount') return formatAmount(Number(value));
  if (column.type === 'percent') return `${formatAmount(Number(value))}%`;
  return String(value ?? '');
};

/** Render the filing attachment on the server so browser print chrome can never appear. */
export function buildDepreciationReportPdf(
  data: Form1342ReportDto,
  meta: DepreciationReportPdfMeta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 32,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const { fontR, fontB } = registerHebrewFonts(doc);
      const pageLeft = doc.page.margins.left;
      const pageRight = doc.page.width - doc.page.margins.right;
      const contentWidth = pageRight - pageLeft;
      const bottomLimit = doc.page.height - doc.page.margins.bottom - 28;
      const headerHeight = 44;
      const rowHeight = 24;

      const drawDocumentHeader = (): void => {
        let y = doc.page.margins.top;
        doc.font(fontB).fontSize(18).fillColor('#000000');
        drawRtl(doc, 'דוח פחת', pageLeft, y, contentWidth, { align: 'center' });
        y += 34;

        doc.font(fontB).fontSize(10);
        drawRtl(
          doc,
          `שם העסק: ${meta.businessName} | מספר העוסק: ${meta.taxFileNumber} | שנת הדיווח: ${meta.year}`,
          pageLeft,
          y,
          contentWidth,
          { align: 'center' },
        );
        doc.y = y + 24;
      };

      const drawTableHeader = (): void => {
        const y = doc.y;
        doc.rect(pageLeft, y, contentWidth, headerHeight).fillColor('#f1f1f1').fill();
        doc.fillColor('#000000').font(fontB);

        let x = pageRight;
        for (const column of COLUMNS) {
          const width = column.width * contentWidth;
          x -= width;
          doc.rect(x, y, width, headerHeight).strokeColor('#777777').stroke();
          doc.fontSize(7).text(String(column.number), x, y + 4, { width, align: 'center', lineBreak: false });
          doc.font(fontB).fontSize(6.8);
          column.labelLines.forEach((line, index) => {
            drawRtl(doc, line, x + 2, y + 15 + index * 10, width - 4, { align: 'center' });
          });
        }
        doc.y = y + headerHeight;
      };

      const addContinuationPage = (): void => {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 32 });
        drawTableHeader();
      };

      const drawRow = (row: Form1342ReportRowDto, emphasized = false): void => {
        if (doc.y + rowHeight > bottomLimit) addContinuationPage();
        const y = doc.y;
        if (emphasized) {
          doc.rect(pageLeft, y, contentWidth, rowHeight).fillColor('#f7f7f7').fill();
        }
        doc.fillColor('#000000').font(emphasized ? fontB : fontR).fontSize(7.5);

        let x = pageRight;
        for (const column of COLUMNS) {
          const width = column.width * contentWidth;
          x -= width;
          doc.rect(x, y, width, rowHeight).strokeColor('#aaaaaa').stroke();
          const value = formatValue(row, column);
          doc.save();
          doc.rect(x + 1, y + 1, width - 2, rowHeight - 2).clip();
          if (column.type === 'text') {
            drawRtl(doc, value, x + 3, y + 8, width - 6, { align: 'right' });
          } else {
            doc.text(value, x + 2, y + 8, { width: width - 4, align: 'center', lineBreak: false });
          }
          doc.restore();
        }
        doc.y = y + rowHeight;
      };

      drawDocumentHeader();
      drawTableHeader();
      data.rows.forEach((row) => drawRow(row));

      const totalsRow: Form1342ReportRowDto = {
        expenseId: 0,
        assetName: 'סה"כ',
        purchaseDate: '',
        activationDate: '',
        originalCost: data.totalOriginalCost,
        changesDuringYear: data.totalChangesDuringYear,
        depreciableCost: data.totalDepreciableCost,
        depreciationRatePerLaw: null as any,
        taxRecognitionPercent: 0,
        currentYearDepreciation: data.totalCurrentYearDepreciation,
        priorYearsDepreciation: data.totalPriorYearsDepreciation,
        totalDepreciation: data.totalDepreciation,
        remainingBalance: data.totalRemainingBalance,
      };
      drawRow(totalsRow, true);

      stampFooterOnAllPages(doc, fontR, PDF_CREATOR_FOOTER);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
