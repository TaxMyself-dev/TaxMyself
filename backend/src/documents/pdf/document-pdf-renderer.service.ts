import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import * as puppeteer from 'puppeteer-core';
import {
  buildDocumentFooter,
  buildDocumentHtml,
  DocumentPdfModel,
  fontCss,
} from './document-pdf.template';

@Injectable()
export class DocumentPdfRenderer {
  private active = 0;
  private cachedFonts: string;

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
    let browser: puppeteer.Browser;
    try {
      browser = await puppeteer.launch({
        executablePath: this.executable(),
        headless: true,
        timeout: 30000,
        args: [
          '--disable-dev-shm-usage',
          // Cloud Run may run as root without a Docker marker file.
          ...(process.getuid?.() === 0 ||
          process.platform === 'win32' ||
          existsSync('/.dockerenv')
            ? ['--no-sandbox']
            : []),
        ],
      });
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) =>
        request.url().startsWith('data:') || request.url() === 'about:blank'
          ? void request.continue()
          : void request.abort(),
      );
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });
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
      try {
        await browser?.close();
      } finally {
        this.active--;
      }
    }
  }
}
