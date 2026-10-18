import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as puppeteer from 'puppeteer-core';
import { DocumentPdfClient } from './document-pdf-client';
import {
  buildDocumentFooter,
  buildDocumentHtml,
  DocumentPdfModel,
  fontCss,
} from './document-pdf.template';

@Injectable()
export class DocumentPdfRenderer implements OnModuleDestroy {
  constructor(private readonly remote: DocumentPdfClient = new DocumentPdfClient()) {}
  private active = 0;
  private cachedFonts: string;

  private browser: puppeteer.Browser;
  private launching: Promise<puppeteer.Browser>;
  private uses = 0;
  private destroyed = false;

  private async closeBrowser(browser: puppeteer.Browser): Promise<void> {
    if (!browser) return;
    if (this.browser === browser) this.browser = undefined;
    let timer: ReturnType<typeof setTimeout>;
    const kill = () => { try { browser.process()?.kill('SIGKILL'); } catch {} };
    try {
      await Promise.race([browser.close(), new Promise<void>((resolve) => {
        timer = setTimeout(() => { kill(); resolve(); }, 2000);
      })]);
    } catch { kill(); }
    finally { clearTimeout(timer); }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.launching) { try { await this.launching; } catch {} }
    await this.closeBrowser(this.browser);
  }

  private async acquireBrowser(): Promise<puppeteer.Browser> {
    if (this.destroyed) throw new ServiceUnavailableException('PDF renderer is closed.');
    if (this.browser?.connected && (this.uses < 100 || this.active > 1)) return this.browser;
    if (!this.launching) {
      this.launching = (async () => {
        await this.closeBrowser(this.browser);
        const browser = await puppeteer.launch({
          executablePath: this.executable(), headless: true, timeout: 30000,
          args: ['--disable-dev-shm-usage',
            ...(process.getuid?.() === 0 || process.platform === 'win32' || existsSync('/.dockerenv')
              ? ['--no-sandbox'] : [])],
        });
        if (this.destroyed) {
          await this.closeBrowser(browser);
          throw new ServiceUnavailableException('PDF renderer is closed.');
        }
        this.browser = browser;
        this.uses = 0;
        return browser;
      })();
    }
    try { return await this.launching; }
    finally { this.launching = undefined; }
  }

  private fonts(): string {
    if (!this.cachedFonts) {
      const dir = join(__dirname, '..', '..', 'assets', 'document-fonts');
      this.cachedFonts = fontCss(
        readFileSync(join(dir, 'Simpler-Regular.otf')).toString('base64'),
        readFileSync(join(dir, 'Simpler-Bold.otf')).toString('base64'),
      );
    }
    return this.cachedFonts;
  }

  private executable(): string {
    const paths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ];
    const executable = paths.find(
      (candidate) => candidate && existsSync(candidate),
    );
    if (!executable)
      throw new ServiceUnavailableException(
        'PDF renderer requires an installed Chromium, Chrome or Edge browser.',
      );
    return executable;
  }

  async render(model: DocumentPdfModel): Promise<Buffer> {
    if (process.env.PDF_SERVICE_URL) return this.remote.render(model);
    // Cloud Run must not silently consume backend memory if configuration is missing.
    if (process.env.K_SERVICE)
      throw new ServiceUnavailableException('PDF_SERVICE_URL must be configured on Cloud Run.');
    if (this.active >= 2)
      throw new ServiceUnavailableException(
        'PDF renderer is busy. Please retry.',
      );
    if (model.items.length > 1000 || model.payments.length > 1000)
      throw new ServiceUnavailableException('Document has too many rows.');
    const html = buildDocumentHtml(model, this.fonts());
    if (html.length > 8 * 1024 * 1024)
      throw new ServiceUnavailableException('Document is too large.');
    this.active++;
    const started = performance.now();
    let stageStarted = started;
    let stage = 'BROWSER_LAUNCH';
    const stages: Record<string, number> = {};
    const mark = (next: string) => {
      const now = performance.now();
      stages[stage] = Math.round(now - stageStarted);
      stage = next;
      stageStarted = now;
    };
    let browser: puppeteer.Browser;
    let context: puppeteer.BrowserContext;
    try {
      browser = await this.acquireBrowser();
      mark('PAGE_SETUP');
      context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) =>
        request.url().startsWith('data:') || request.url() === 'about:blank'
          ? void Promise.resolve(request.continue()).catch(() => {})
          : void Promise.resolve(request.abort()).catch(() => {}),
      );
      mark('HTML_LOAD');
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: 30000,
      });
      mark('ASSET_READY');
      let readyTimer: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all(Array.from(document.images, async (image) => {
            await image.decode();
            if (!image.naturalWidth) throw Error('PDF_IMAGE_NOT_READY');
          }));
          if (Array.from(document.fonts).some(font => font.status === 'error'))
            throw Error('PDF_FONT_NOT_READY');
        }), new Promise<never>((_, reject) => {
          readyTimer = setTimeout(() => reject(new Error('PDF asset readiness timed out')), 30000);
        })]);
      } finally { clearTimeout(readyTimer); }
      mark('PDF_PRINT');
      const bytes = await page.pdf({
        format: 'A4',
        printBackground: true,
        waitForFonts: true,
        timeout: 30000,
        margin: { top: '14mm', right: '15mm', bottom: '22mm', left: '15mm' },
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: buildDocumentFooter(model.preview, this.fonts()),
      });
      return Buffer.from(bytes);
    } finally {
      mark('CONTEXT_CLOSE');
      try {
        if (context) {
          let timer: ReturnType<typeof setTimeout>;
          try {
            await Promise.race([context.close(), new Promise<void>((resolve) => {
              timer = setTimeout(() => {
                void this.closeBrowser(browser).then(resolve);
              }, 2000);
            })]);
          } catch { await this.closeBrowser(browser); }
          finally { clearTimeout(timer); }
        } else if (browser) await this.closeBrowser(browser);
      } finally {
        this.uses++;
        this.active--;
        mark('DONE');
        if (process.env.NODE_ENV === 'development') {
          try {
            console.log(JSON.stringify({ event: 'pdf_local_render_stages',
              stagesMs: stages, totalMs: Math.round(performance.now() - started) }));
          } catch {}
        }
      }
    }
  }
}
