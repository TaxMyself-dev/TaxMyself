import { buildDocumentHtml, DocumentPdfModel } from './document-pdf.template';

const model = (): DocumentPdfModel => ({
  title: 'קבלה מספר 10000',
  issuerName: 'נגרות',
  recipientName: 'לקוח',
  date: '12-10-2026',
  documentType: 'מקור',
  preview: true,
  items: [
    {
      פירוט: '<script>alert(1)</script>',
      כמות: '1',
      מחיר: '₪67',
      הנחה: '₪0',
      'סה"כ': '₪67',
    },
  ],
  totals: [{ תיאור: 'סה״כ', סכום: '₪67' }],
  payments: [],
  paymentTotals: [],
});

describe('document PDF template', () => {
  it('escapes customer text and isolates rendering from external resources', () => {
    const html = buildDocumentHtml(
      { ...model(), recipientName: '"<img src=https://evil>' },
      '',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=https');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('dir="rtl"');
  });
  it('omits empty optional sections and marks previews', () => {
    const html = buildDocumentHtml(model(), '');
    expect(html).toContain('טיוטה');
    expect(html).not.toContain('<section class="payments">');
    expect(html).not.toContain('<div class="allocation">');
    expect(html).not.toContain('<img class="logo"');
  });
  it('retains subtitle, free note, allocation, payments and safe logo bytes', () => {
    const html = buildDocumentHtml(
      {
        ...model(),
        preview: false,
        subtitle: 'קבלה עבור חשבון עסקה 112233',
        note: 'תודה',
        allocation: 'מספר הקצאה: 123',
        logoDataUri: 'data:image/png;base64,YWJj',
        payments: [
          {
            'אמצעי תשלום': 'מזומן',
            פירוט: 'שולם במזומן',
            תאריך: '12-10-2026',
            סכום: '₪67',
          },
        ],
      },
      '',
    );
    expect(html).toContain('112233');
    expect(html).toContain('תודה');
    expect(html).toContain('מספר הקצאה: 123');
    expect(html).toContain('שולם במזומן');
    expect(html).toContain('<img class="logo"');
    expect(html).not.toContain('<div class="draft">');
  });
  it.each(['https://example.com/logo.png', 'data:image/svg+xml;base64,YWJj'])(
    'rejects unsafe logo %s',
    (logoDataUri) => {
      expect(() => buildDocumentHtml({ ...model(), logoDataUri }, '')).toThrow(
        'Invalid document logo',
      );
    },
  );
});
