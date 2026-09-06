import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PdfPreviewDialogComponent } from './pdf-preview-dialog.component';

/**
 * Smallest valid one-page PDF: a filled rectangle, no fonts and no external
 * resources, so the test exercises the render pipeline without depending on
 * font assets.
 */
function createPdfBlob(): Blob {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 40 >>\nstream\n0 0 1 rg 20 20 160 260 re f\nendstream\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new Blob([pdf], { type: 'application/pdf' });
}

/** Resolves once `check` passes, or rejects after `timeout` ms. */
async function waitFor(check: () => boolean, timeout = 20000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('PdfPreviewDialogComponent', () => {
  let fixture: ComponentFixture<PdfPreviewDialogComponent>;
  let component: PdfPreviewDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PdfPreviewDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PdfPreviewDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing while hidden', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pdf-preview')).toBeNull();
  });

  it('rasterizes the PDF into a canvas per page when opened', async () => {
    fixture.componentRef.setInput('pdf', createPdfBlob());
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    await waitFor(() => {
      fixture.detectChanges();
      const canvas = fixture.nativeElement.querySelector('canvas.pdf-preview__page') as HTMLCanvasElement | null;
      return !!canvas && canvas.width > 0;
    });

    expect(component.errorMessage()).toBeNull();
    expect(component.pages().length).toBe(1);

    const canvases = fixture.nativeElement.querySelectorAll('canvas.pdf-preview__page');
    expect(canvases.length).toBe(1);
    expect((canvases[0] as HTMLCanvasElement).width).toBeGreaterThan(0);
  });

  it('emits closed from the close button and from Escape', async () => {
    const closed = jasmine.createSpy('closed');
    component.closed.subscribe(closed);

    fixture.componentRef.setInput('pdf', createPdfBlob());
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.pdf-preview__close') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    expect(closed).toHaveBeenCalledTimes(1);

    component.onEscape();
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('drops its pages when hidden again', async () => {
    fixture.componentRef.setInput('pdf', createPdfBlob());
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();

    await waitFor(() => {
      fixture.detectChanges();
      return component.pages().length === 1;
    });

    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();

    expect(component.pages().length).toBe(0);
    expect(fixture.nativeElement.querySelector('.pdf-preview')).toBeNull();
  });
});
