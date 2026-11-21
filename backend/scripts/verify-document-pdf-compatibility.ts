/** Synthetic acceptance fixtures. Explicit --sign sends four PDFs to FillFaster. */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { parse } from 'dotenv';
import { DocumentPdfRenderer } from '../src/documents/pdf/document-pdf-renderer.service';
import { FillFasterSigner } from '../src/documents/pdf/fillfaster-signer.service';
import * as template from '../src/documents/pdf/document-pdf.template';

async function main() {
  const out = resolve(process.argv[2] || join(__dirname, '../../.test-tmp/pdf-ttf'));
  const sign = process.argv.includes('--sign');
  mkdirSync(out, { recursive: true });
  // Use standalone components only; never bootstrap Nest, DB, storage or mail.
  delete process.env.PDF_SERVICE_URL;
  delete process.env.K_SERVICE;
  if (sign) process.env.FILLFASTER_API_TOKEN = parse(readFileSync(resolve(__dirname, '../.env'))).FILLFASTER_API_TOKEN;
  const local = new DocumentPdfRenderer();
  const service = require('../../pdf-service/src/renderer.cjs').createRenderer({
    puppeteer: require('../../pdf-service/node_modules/puppeteer-core'), template,
    executablePath: (local as any).executable(),
    fontDirectory: resolve(__dirname, '../src/assets/document-fonts'),
  });
  const signer = new FillFasterSigner();
  try {
    for (const count of [3, 70]) for (const copy of [false, true]) {
      const name = `${count === 3 ? 'single' : 'multipage'}-${copy ? 'copy' : 'original'}`;
      const model: template.DocumentPdfModel = {
        title: 'מסמך בדיקת תאימות PDF', issuerName: 'עסק לדוגמה - בדיקה בלבד',
        issuerDetails: 'פרטים סינתטיים בלבד', recipientName: 'לקוח לדוגמה',
        date: '21-11-2026', documentType: copy ? 'העתק נאמן למקור' : 'מקור',
        preview: false, note: 'מסמך ניסוי בלבד. אינו מסמך חשבונאי. עברית ו-English, ₪1,234.56.',
        items: Array.from({ length: count }, (_, i) => ({
          'פירוט': `פריט בדיקה ${i + 1} - תיאור שירות בעברית ושילוב English`,
          'כמות': '1.00', 'מחיר': '₪100.00', 'סה"כ': '₪100.00',
        })),
        totals: [{ 'תיאור': 'סה״כ', 'סכום': `₪${(count * 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}` }],
        payments: [{ 'אמצעי תשלום': 'העברה בנקאית', 'פירוט': 'בדיקה בלבד', 'תאריך': '21-11-2026', 'סה"כ': `₪${count * 100}.00` }],
        paymentTotals: [],
      };
      writeFileSync(join(out, `${name}-local.pdf`), await local.render(model));
      const unsigned = await service({ version: 1, requestId: name, document: model });
      writeFileSync(join(out, `${name}-service.pdf`), unsigned);
      if (sign) {
        const target = join(out, `${name}-signed.pdf`);
        // Do not silently repeat paid signing when reusing an evidence directory.
        if (require('fs').existsSync(target)) throw Error('Signed fixture already exists');
        writeFileSync(target, await signer.sign(unsigned), { flag: 'wx' });
      }
      console.log(JSON.stringify({ fixture: name, local: true, standalone: true, signed: sign }));
    }
  } finally { await local.onModuleDestroy(); await service.close(); }
}
main().catch(() => { console.error('PDF compatibility fixture generation failed; no payload or credentials logged.'); process.exitCode = 1; });
