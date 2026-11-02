export interface DocumentPdfModel {
  title: string;
  issuerName?: string;
  issuerDetails?: string;
  recipientName?: string;
  recipientTaxNumber?: string;
  documentType: string;
  date: string;
  subtitle?: string;
  note?: string;
  allocation?: string;
  logoDataUri?: string;
  preview: boolean;
  items: Record<string, string>[];
  totals: Record<string, string>[];
  payments: Record<string, string>[];
  paymentTotals: Record<string, string>[];
}

export const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function fontCss(regular: string, bold: string): string {
  return `@font-face{font-family:Receipt;src:url(data:font/otf;base64,${regular}) format('opentype');font-weight:400}
    @font-face{font-family:Receipt;src:url(data:font/otf;base64,${bold}) format('opentype');font-weight:700}`;
}

function totals(rows: Record<string, string>[]): string {
  return `<div class="totals">${rows
    .map(
      (row) =>
        `<div class="total-row"><span>${escapeHtml(
          row['תיאור'],
        )}</span><bdi>${escapeHtml(row['סכום'])}</bdi></div>`,
    )
    .join('')}</div>`;
}

function table(
  rows: Record<string, string>[],
  columns: string[],
  widths: number[],
): string {
  return `<table><colgroup>${widths
    // Numeric columns use their unbroken content width; description gets the remainder.
    .map((width, index) =>
      index === 0 ? `<col style="width:${width}%">` : '<col>',
    )
    .join('')}</colgroup>
    <thead><tr>${columns
      .map((column) => `<th>${escapeHtml(column)}</th>`)
      .join('')}</tr></thead>
    <tbody>${rows
      .map(
        (row) =>
          `<tr>${columns
            .map(
              (column) =>
                `<td class="${
                  column === 'פירוט' || column === 'אמצעי תשלום'
                    ? 'description'
                    : 'numeric'
                }"><bdi dir="${
                  column === 'פירוט' || column === 'אמצעי תשלום'
                    ? 'auto'
                    : 'ltr'
                }">${escapeHtml(row[column])}</bdi></td>`,
            )
            .join('')}</tr>`,
      )
      .join('')}</tbody></table>`;
}

export function buildDocumentHtml(
  model: DocumentPdfModel,
  fonts: string,
): string {
  // Images are server-owned raster bytes, never arbitrary URLs or SVG.
  if (
    model.logoDataUri &&
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
      model.logoDataUri,
    )
  ) {
    throw new Error('Invalid document logo');
  }
  const optional = (className: string, value: string) =>
    value ? `<div class="${className}">${escapeHtml(value)}</div>` : '';
  const paymentDetails = model.payments.some((row) => row['פירוט']?.trim());
  const paymentRows = model.payments.map((row) => ({
    ...row,
    'סה"כ': row['סכום'],
  }));
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(
    model.title,
  )}</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'">
    <style>${fonts}
    *{box-sizing:border-box}html,body{margin:0;padding:0}body{font:12pt Receipt,Arial,sans-serif;color:#1c2230;background:white;line-height:1.5}
    .header{display:flex;justify-content:space-between;align-items:flex-start;min-height:42mm;gap:12mm}
    .issuer{text-align:right;white-space:pre-line;overflow-wrap:anywhere;max-width:128mm}.issuer-name{font-weight:700}.issuer-details{line-height:1.6}
    .logo{width:38mm;height:38mm;object-fit:cover;object-position:center;border-radius:50%;flex:none}.recipient-band{display:flex;justify-content:space-between;align-items:flex-start;gap:10mm;margin-top:8mm}
    .recipient{max-width:120mm;overflow-wrap:anywhere}.recipient-name{color:#59b498;font-weight:700}.recipient-tax{margin-top:2mm}
    .date{color:#59b498;white-space:nowrap;direction:rtl;padding-top:1mm}.title-block{text-align:center;margin:16mm auto 0;break-inside:avoid}
    h1{font-size:25pt;line-height:1.3;margin:0;font-weight:700;overflow-wrap:anywhere}.underline{display:inline-block;border-bottom:1.3pt solid #59b498;padding-bottom:3mm;max-width:100%}
    .subtitle,.note{font-size:12pt;margin-top:3mm;white-space:pre-line;overflow-wrap:anywhere}.allocation{margin-top:5mm;overflow-wrap:anywhere}
    .items{margin-top:15mm}.payments{margin-top:22mm}.section-title{font-size:12pt;margin-bottom:3mm;text-align:right;break-after:avoid}
    table{width:100%;border:1pt solid #777;border-radius:2mm;border-spacing:0;table-layout:auto;direction:rtl}
    thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:2.7mm 3.2mm;vertical-align:top;overflow-wrap:anywhere}
    th{font-weight:700;border-bottom:1pt solid #888;text-align:right;white-space:nowrap;overflow-wrap:normal}td{border-bottom:.7pt solid #999}tbody tr:last-child td{border-bottom:0}
    .description{white-space:pre-line}.numeric{white-space:nowrap;overflow-wrap:normal;word-break:normal}td:last-child{font-weight:700}.totals{margin-top:4mm;width:max-content;min-width:100mm;max-width:100%;margin-right:auto;break-inside:avoid}
    .total-row{display:flex;justify-content:space-between;gap:8mm;font-weight:700;font-size:13pt;margin-top:1mm;white-space:nowrap}.total-row>span,.total-row>bdi{flex-shrink:0;white-space:nowrap}
    .draft{position:fixed;top:100mm;left:15mm;right:15mm;font-size:80pt;color:rgba(28,34,48,.065);transform:rotate(-25deg);text-align:center;z-index:-1;pointer-events:none}
    </style></head><body>${
      model.preview ? '<div class="draft">טיוטה</div>' : ''
    }
    <header class="header"><div class="issuer"><div class="issuer-name">${escapeHtml(
      model.issuerName,
    )}</div><div class="issuer-details">${escapeHtml(
    model.issuerDetails,
  )}</div></div>${
    model.logoDataUri
      ? `<img class="logo" alt="לוגו העסק" src="${model.logoDataUri}">`
      : ''
  }</header>
    <div class="recipient-band"><div class="recipient"><div>לכבוד <span class="recipient-name">${escapeHtml(
      model.recipientName,
    )}</span></div>${optional(
    'recipient-tax',
    model.recipientTaxNumber,
  )}</div><div class="date">${escapeHtml(
    model.documentType,
  )} &nbsp; <bdi dir="ltr">${escapeHtml(model.date)}</bdi></div></div>
    <section class="title-block"><h1><span class="underline">${escapeHtml(
      model.title,
    )}</span></h1>${optional('subtitle', model.subtitle)}${optional(
    'note',
    model.note && model.note !== model.subtitle ? model.note : '',
  )}${optional('allocation', model.allocation)}</section>
    <section class="items"><div class="section-title">פריטים</div>${table(
      model.items,
      ['פירוט', 'כמות', 'מחיר', 'הנחה', 'סה"כ'],
      [48, 12, 13, 13, 14],
    )}${totals(model.totals)}</section>
    ${
      model.payments.length
        ? `<section class="payments"><div class="section-title">פירוט תשלומים</div>${
            paymentDetails
              ? table(
                  paymentRows,
                  ['אמצעי תשלום', 'פירוט', 'תאריך', 'סה"כ'],
                  [32, 31, 22, 15],
                )
              : table(
                  paymentRows,
                  ['אמצעי תשלום', 'תאריך', 'סה"כ'],
                  [61, 24, 15],
                )
          }${totals(model.paymentTotals)}</section>`
        : ''
    }
    </body></html>`;
}

export function buildDocumentFooter(preview: boolean, fonts: string): string {
  return `<style>${fonts}</style><div dir="rtl" style="width:100%;text-align:center;font:10px Receipt,Arial,sans-serif;color:#1c2230;padding:0 15mm">
    ${
      preview
        ? 'תצוגה מקדימה - המסמך אינו חתום'
        : 'המסמך הופק ונחתם דיגיטלית על ידי'
    } <span style="font-weight:bold;color:#59b498">KeepInTax</span>
    <span style="display:block;font-size:8px;margin-top:3px">עמוד <span class="pageNumber"></span> מתוך <span class="totalPages"></span></span></div>`;
}
