import { mkdirSync, createWriteStream } from 'fs';
import { resolve } from 'path';
import PDFDocument = require('pdfkit');
import { QA_EXPENSES } from '../src/demo-data/profiles/assistant-qa.profile';

async function main() {
  const out=resolve(process.env.ASSISTANT_QA_OUTPUT || '../.local/assistant-qa','pdfs');
  mkdirSync(out,{recursive:true});
  const rows=QA_EXPENSES.map((e,i)=>({key:`expense-${i+1}`,invoice:`QA-2026-${i+1}`,business:e.business,supplier:e.supplierId,date:e.date,gross:e.sum}));
  rows.push({key:'unmatched',invoice:'QA-UNMATCHED',business:QA_EXPENSES[0].business,supplier:'999200093',date:'2026-11-12',gross:295});
  for(const r of rows) {
    const doc=new PDFDocument({size:'A4',margin:52});
    const stream=createWriteStream(resolve(out,`${r.key}.pdf`));doc.pipe(stream);
    doc.fontSize(24).fillColor('#9a2020').text('DEMO ONLY - NOT A TAX DOCUMENT');
    doc.moveDown().fontSize(16).fillColor('#16334b').text('Synthetic supplier invoice / receipt');
    doc.moveDown().fontSize(12).fillColor('#111111');
    for(const [label,value] of [['Fixture','KeepInTax Assistant QA'],['Invoice',r.invoice],['Date',r.date],['Supplier (fictional)',r.supplier],['Customer business (fictional)',r.business],['Service','Synthetic test purchase']]) doc.text(`${label}: ${value}`).moveDown(0.5);
    doc.moveDown().text(`Before VAT: ILS ${(r.gross/1.18).toFixed(2)}`);
    doc.text(`VAT (18%): ILS ${(r.gross-r.gross/1.18).toFixed(2)}`);
    doc.fontSize(18).text(`Total paid: ILS ${r.gross.toFixed(2)}`);
    doc.moveDown().fontSize(10).fillColor('#555555').text('Fictional fixture for development and assistant testing. No real goods, payment, tax invoice, allocation number or customer information.');
    doc.end(); await new Promise<void>((resolve,reject)=>{stream.on('finish',resolve);stream.on('error',reject);});
  }
  console.log(`Generated ${rows.length} clearly marked synthetic PDFs`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
