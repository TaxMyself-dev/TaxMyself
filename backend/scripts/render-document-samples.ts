/** Standalone visual QA: no app bootstrap, database or provider calls. */
import { mkdirSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import sharp = require('sharp');
import { DocumentPdfRenderer } from '../src/documents/pdf/document-pdf-renderer.service';
import { DocumentPdfModel } from '../src/documents/pdf/document-pdf.template';

async function main() {
  const out = resolve(process.argv[2] ?? 'work/document-pdf-samples');
  mkdirSync(out, { recursive: true });
  // Deliberately illustrative logo, not an uploaded customer image.
  const logo = await sharp(Buffer.from('<svg width="240" height="240" xmlns="http://www.w3.org/2000/svg"><circle cx="120" cy="120" r="116" fill="#dddddd"/><text x="120" y="133" text-anchor="middle" font-family="Arial" font-size="35" fill="#555">LOGO</text></svg>')).png().toBuffer();
  const base: DocumentPdfModel = {
    title: 'קבלה מספר 10000000', issuerName: 'שם העסק: נגרות',
    issuerDetails: 'מ.ע. / ח.פ.: 314719279\nטלפון: 052-6204310\nכתובת אימייל: shmuelharel10@gmail.com\nכתובת: ירושלים',
    recipientName: 'חן קופולוביץ׳', recipientTaxNumber: 'מספר עוסק: 213654', date: '12-10-2026', documentType: 'מקור',
    subtitle: 'קבלה עבור חשבון עסקה 112233', preview: true,
    items: Array.from({ length: 3 }, (_, i) => ({ 'פירוט': `מוצר ${i + 1}`, 'כמות': '1.00', 'מחיר': '₪67', 'הנחה': '₪7', 'סה"כ': '₪60' })),
    totals: [{ 'תיאור': 'סה"כ לפני הנחה:', 'סכום': '₪201' }, { 'תיאור': 'הנחה:', 'סכום': '₪21' }, { 'תיאור': 'סה״כ', 'סכום': '₪180' }],
    payments: [{ 'אמצעי תשלום': 'העברה בנקאית', 'פירוט': '', 'תאריך': '12-10-2026', 'סכום': '₪180' }],
    paymentTotals: [{ 'תיאור': 'סה״כ', 'סכום': '₪180' }],
  };
  const renderer = new DocumentPdfRenderer();
  for (const [name, model] of [
    ['receipt-logo', { ...base, logoDataUri: `data:image/png;base64,${logo.toString('base64')}` }],
    ['receipt-no-logo', base],
    ['invoice-mixed-discount', { ...base, title: 'חשבונית מס מספר 20000', subtitle: undefined,
      items: [
        { 'פירוט': 'שירות חייב במע״מ', 'כמות': '1.00', 'מחיר': '₪900', 'הנחה': '₪0', 'סה"כ': '₪900' },
        { 'פירוט': 'פריט ללא מע״מ', 'כמות': '1.00', 'מחיר': '₪400', 'הנחה': '₪100', 'סה"כ': '₪300' },
      ],
      totals: [
        { 'תיאור': 'סה"כ לפני הנחה:', 'סכום': '₪1,300' },
        { 'תיאור': 'הנחה:', 'סכום': '₪100' },
        { 'תיאור': 'סה״כ חייב במע״מ:', 'סכום': '₪900' },
        { 'תיאור': 'מע״מ:', 'סכום': '₪162' },
        { 'תיאור': 'סה״כ ללא מע״מ:', 'סכום': '₪300' },
        { 'תיאור': 'סה"כ:', 'סכום': '₪1,362' },
      ], payments: [], paymentTotals: [] }],
    ['invoice-multipage', { ...base, title: 'חשבונית מס מספר 20000', allocation: 'מספר הקצאה: 123456789',
      note: 'הערה לדוגמה: שילוב עברית ו-English, טקסט ארוך שממשיך בצורה טבעית בשורה הבאה ללא חיתוך.',
      items: Array.from({ length: 55 }, (_, i) => ({ 'פירוט': `פריט ${i + 1} - עבודת נגרות לפי הזמנה עבור לקוח עם תיאור ארוך`, 'כמות': '1.00', 'מחיר': '₪67', 'הנחה': '₪0', 'סה"כ': '₪67' })),
      totals: [{ 'תיאור': 'סה״כ לפני מע״מ', 'סכום': '₪3,685' }, { 'תיאור': 'מע״מ', 'סכום': '₪663.30' }, { 'תיאור': 'סה״כ', 'סכום': '₪4,348.30' }],
      payments: [], paymentTotals: [] }],
  ] as [string, DocumentPdfModel][]) {
    const file = join(out, `${name}.pdf`);
    writeFileSync(file, await renderer.render(model));
    console.log(file);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
