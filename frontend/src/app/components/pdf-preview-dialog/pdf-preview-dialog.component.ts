import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/**
 * What the dialog can display: a PDF that was already downloaded (Blob — what
 * `documents/preview-doc` returns) or a URL pdf.js can fetch by itself (so the
 * existing `FilesService.previewFile()` call sites can migrate to this dialog
 * later without changing shape).
 */
export type PdfPreviewSource = Blob | string | null;

/**
 * pdf.js is loaded on first use only, so it lands in its own lazy chunk instead
 * of the initial bundle. Module-level so every dialog instance (and any future
 * call site) shares one library instance and one worker.
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
    // Worker is emitted as its own hashed chunk by the build (see
    // ./pdfjs.worker.ts), so there is no asset copy to keep in sync and no
    // reliance on how the host serves .mjs files.
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('./pdfjs.worker', import.meta.url),
      { type: 'module' },
    );
    return pdfjs;
  });
  return pdfjsPromise;
}

/** Widest a page is drawn at, so the preview stays readable on desktop too. */
const MAX_PAGE_CSS_WIDTH = 880;
/** Narrowest page width we will render at (below this we just overflow). */
const MIN_PAGE_CSS_WIDTH = 240;
/** Canvas backing-store cap — mobile Chrome/Safari refuse to allocate beyond ~16.7M px. */
const MAX_CANVAS_AREA = 16_000_000;

/**
 * Full-screen, in-app PDF viewer: pages are rasterized to <canvas> by pdf.js.
 *
 * Deliberately does NOT use iframe/object/embed/window.open — Chrome on Android
 * never renders `application/pdf` inline in an embedded context and instead
 * shows a thumbnail placeholder with an "Open" button that hands the file to an
 * external viewer.
 */
@Component({
  selector: 'app-pdf-preview-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pdf-preview-dialog.component.html',
  styleUrls: ['./pdf-preview-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PdfPreviewDialogComponent {

  /** PDF to show — a Blob, or a URL pdf.js will fetch. */
  readonly pdf = input<PdfPreviewSource>(null);
  readonly visible = input<boolean>(false);
  readonly title = input<string>('תצוגה מקדימה');

  readonly closed = output<void>();

  readonly isLoading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  /** One entry per page — drives the canvas elements in the template. */
  readonly pages = signal<number[]>([]);

  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly pageCanvases = viewChildren<ElementRef<HTMLCanvasElement>>('pageCanvas');

  private readonly document = signal<PDFDocumentProxy | null>(null);
  private activeRenderTask: RenderTask | null = null;
  /** Bumped on every (re)render so a superseded pass can bail out. */
  private renderToken = 0;
  /** Same idea for document loads, in case the source changes mid-load. */
  private loadToken = 0;
  private lastRenderedWidth = 0;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  /** Element focused before the dialog opened, so focus can go back on close. */
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    // Open/close: react to the inputs rather than requiring the host to call methods.
    effect(() => {
      const source = this.pdf();
      if (this.visible() && source) {
        void this.load(source);
      } else if (!this.visible()) {
        this.teardown();
      }
    });

    // The canvases only exist once the template has rendered `pages()`, and a
    // signal query re-fires this effect at exactly that point.
    effect(() => {
      const canvases = this.pageCanvases();
      const doc = this.document();
      if (doc && canvases.length === doc.numPages && canvases.length > 0) {
        void this.renderAllPages();
      }
    });

    // Move focus into the dialog as soon as it exists, so Escape/Tab act on it,
    // and hand focus back to whatever opened it once it goes away.
    effect(() => {
      const button = this.closeButton();
      if (button) {
        this.previouslyFocused = globalThis.document.activeElement as HTMLElement | null;
        button.nativeElement.focus();
      } else {
        this.previouslyFocused?.focus();
        this.previouslyFocused = null;
      }
    });

    inject(DestroyRef).onDestroy(() => this.teardown());
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible()) {
      this.close();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.visible() || !this.document()) {
      return;
    }
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    // Re-rasterize at the new width — a canvas scaled by CSS alone goes blurry.
    this.resizeTimer = setTimeout(() => {
      if (Math.abs(this.availableWidth() - this.lastRenderedWidth) > 4) {
        void this.renderAllPages();
      }
    }, 200);
  }

  private async load(source: Blob | string): Promise<void> {
    this.cancelActiveRender();
    const token = ++this.loadToken;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const pdfjs = await loadPdfjs();
      const data = typeof source === 'string'
        ? { url: source }
        : { data: new Uint8Array(await source.arrayBuffer()) };

      const doc = await pdfjs.getDocument(data).promise;
      if (!this.visible() || token !== this.loadToken) {
        // Closed, or superseded by a newer source, while this one was loading.
        await doc.destroy();
        return;
      }

      await this.destroyDocument();
      this.document.set(doc);
      this.pages.set(Array.from({ length: doc.numPages }, (_, i) => i + 1));
    } catch (error) {
      if (token !== this.loadToken) {
        return;
      }
      console.error('Failed to open PDF preview:', error);
      this.errorMessage.set('לא ניתן להציג את המסמך. נסה שוב.');
      this.isLoading.set(false);
    }
  }

  private async renderAllPages(): Promise<void> {
    const doc = this.document();
    const canvases = this.pageCanvases();
    if (!doc || canvases.length !== doc.numPages) {
      return;
    }

    this.cancelActiveRender();
    const token = ++this.renderToken;

    const cssWidth = this.availableWidth();
    this.lastRenderedWidth = cssWidth;

    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        if (token !== this.renderToken) {
          return;
        }

        const page = await doc.getPage(pageNumber);
        const unscaled = page.getViewport({ scale: 1 });
        const cssScale = cssWidth / unscaled.width;
        const outputScale = this.pickOutputScale(unscaled.width * cssScale, unscaled.height * cssScale);
        const viewport = page.getViewport({ scale: cssScale * outputScale });

        const canvas = canvases[pageNumber - 1].nativeElement;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / outputScale)}px`;
        canvas.style.height = `${Math.floor(viewport.height / outputScale)}px`;

        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) {
          throw new Error('2D canvas context unavailable');
        }

        const task = page.render({ canvasContext, viewport });
        this.activeRenderTask = task;
        await task.promise;
        this.activeRenderTask = null;
        page.cleanup();

        if (pageNumber === 1) {
          // First page is on screen — drop the spinner instead of waiting for
          // the whole document.
          this.isLoading.set(false);
        }
      }
      this.isLoading.set(false);
    } catch (error) {
      if (token !== this.renderToken || this.isCancellation(error)) {
        return; // Superseded by a newer render pass, or the dialog closed.
      }
      console.error('Failed to render PDF preview:', error);
      this.errorMessage.set('לא ניתן להציג את המסמך. נסה שוב.');
      this.isLoading.set(false);
    }
  }

  /** Width, in CSS pixels, a page should occupy inside the scroll area. */
  private availableWidth(): number {
    const host = this.scroller()?.nativeElement;
    const styles = host ? getComputedStyle(host) : null;
    const padding = styles
      ? parseFloat(styles.paddingInlineStart || '0') + parseFloat(styles.paddingInlineEnd || '0')
      : 0;
    const inner = (host?.clientWidth ?? MIN_PAGE_CSS_WIDTH) - padding;
    return Math.max(MIN_PAGE_CSS_WIDTH, Math.min(inner, MAX_PAGE_CSS_WIDTH));
  }

  /**
   * Device-pixel-ratio oversampling, clamped so a large page on a 3x phone can
   * never exceed the platform canvas limit.
   */
  private pickOutputScale(cssWidth: number, cssHeight: number): number {
    let scale = Math.min(window.devicePixelRatio || 1, 2);
    while (scale > 1 && cssWidth * scale * cssHeight * scale > MAX_CANVAS_AREA) {
      scale -= 0.25;
    }
    return Math.max(1, scale);
  }

  private cancelActiveRender(): void {
    this.renderToken++;
    this.activeRenderTask?.cancel();
    this.activeRenderTask = null;
  }

  private async destroyDocument(): Promise<void> {
    const doc = this.document();
    this.document.set(null);
    if (doc) {
      await doc.destroy().catch(() => undefined);
    }
  }

  private teardown(): void {
    this.loadToken++;
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    this.cancelActiveRender();
    this.pages.set([]);
    this.isLoading.set(false);
    this.errorMessage.set(null);
    this.lastRenderedWidth = 0;
    void this.destroyDocument();
  }

  private isCancellation(error: unknown): boolean {
    return !!error && (error as { name?: string }).name === 'RenderingCancelledException';
  }
}
