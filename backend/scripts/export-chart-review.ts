import 'reflect-metadata';
import { Workbook } from 'exceljs';
import * as path from 'path';
import { CHART_ACCOUNTS, ACCOUNTING_SECTIONS } from '../src/bookkeeping/chart.seed';

// One-off doc export (Phase 1 review) — not wired into any app flow.
// Regenerate with: npx ts-node -r tsconfig-paths/register scripts/export-chart-review.ts

const TYPE_LABELS: Record<string, string> = {
  asset: 'נכס',
  liability: 'התחייבות',
  equity: 'הון',
  income: 'הכנסה',
  expense: 'הוצאה',
};

const RECOGNITION_LABELS: Record<string, string> = {
  RECOGNIZED: 'מוכר',
  NOT_RECOGNIZED: 'לא מוכר',
};

const sectionNameByCode = new Map(ACCOUNTING_SECTIONS.map((s) => [s.code, s.name]));

async function main() {
  const wb = new Workbook();
  const ws = wb.addWorksheet('תרשים חשבונות', { views: [{ rightToLeft: true }] });

  const header = [
    'קוד חתך', 'שם חתך', 'קוד חשבון', 'שם חשבון', 'קוד ישן', 'קוד 6111', 'סוג חשבון',
    'אחוז מע"מ', 'אחוז מס', 'אחוז הפחתה', 'ציוד (פחת)', 'הכרה',
  ];
  const headerRow = ws.addRow(header);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };

  for (const a of CHART_ACCOUNTS) {
    ws.addRow([
      a.sectionCode ?? '',
      a.sectionCode ? (sectionNameByCode.get(a.sectionCode) ?? '') : '',
      a.code,
      a.name,
      a.legacyCode ?? '',
      a.code6111 ?? 'TODO',
      TYPE_LABELS[a.type] ?? a.type,
      a.vatPercent ?? '',
      a.taxPercent ?? '',
      a.reductionPercent ?? '',
      a.isEquipment === null ? '' : (a.isEquipment ? 'כן' : 'לא'),
      a.recognitionType ? (RECOGNITION_LABELS[a.recognitionType] ?? a.recognitionType) : '',
    ]);
  }

  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 32;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 10;
  ws.getColumn(7).width = 10;
  ws.getColumn(8).width = 10;
  ws.getColumn(9).width = 10;
  ws.getColumn(10).width = 10;
  ws.getColumn(11).width = 10;
  ws.getColumn(12).width = 10;

  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { horizontal: 'right' };
    });
  });
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];

  const outPath = path.resolve(__dirname, '../../docs/redesign/chart-review.xlsx');
  await wb.xlsx.writeFile(outPath);
  console.log(`Wrote ${CHART_ACCOUNTS.length} rows to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
