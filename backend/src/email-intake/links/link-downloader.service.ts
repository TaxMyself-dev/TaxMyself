import { Injectable } from '@nestjs/common';
import { parse } from 'parse5';
import * as puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';
import { chown, mkdtemp, readdir, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PdfInspectionService } from '../../protected-pdf/pdf-inspection.service';
import { LinkNetwork } from './link-network';
import { LinkMetrics, LinkSelector } from './link-selector';
import {
  chooseDeterministically,
  documentAction,
  LinkCandidate,
  LinkDownloadError,
  LINK_MAX_BYTES,
  LINK_TIMEOUT_MS,
  publicLink,
  unsafeAction,
  unrelatedAction,
} from './link-policy';

export function staticCandidates(html: string, base: string) {
  const candidates: LinkCandidate[] = [];
  const texts: string[] = [];
  const nodeText = (n: any, depth = 0): string =>
    depth > 100
      ? ''
      : n.nodeName === '#text'
      ? n.value
      : (n.childNodes || [])
          .map((child) => nodeText(child, depth + 1))
          .join(' ');
  const visit = (n: any, depth = 0) => {
    if (depth > 100) return;
    if (['script', 'style', 'noscript'].includes(n.tagName)) return;
    if (n.nodeName === '#text') texts.push(n.value);
    if (['a', 'iframe', 'embed', 'object'].includes(n.tagName)) {
      const value = n.attrs?.find((a) =>
        ['href', 'src', 'data'].includes(a.name),
      )?.value;
      const label = nodeText(n).trim().slice(0, 160);
      if (value && !unsafeAction(label))
        try {
          const url = publicLink(new URL(value, base).href).href;
          if (candidates.length < 60)
            candidates.push({
              id: 'c' + candidates.length,
              text: label,
              tag: n.tagName.toUpperCase(),
              url,
            });
        } catch {}
    }
    for (const child of n.childNodes || []) visit(child, depth + 1);
  };
  visit(parse(html));
  return { candidates, text: texts.join(' ').slice(0, 1600) };
}
export interface LinkDownloadContext {
  assertAllowed: () => Promise<void>;
  reserveModel: () => Promise<void>;
}
@Injectable()
export class LinkDownloader {
  private active = 0;
  constructor(
    readonly network: LinkNetwork,
    readonly selector: LinkSelector,
    readonly pdf: PdfInspectionService,
  ) {}
  async download(url: string, context: LinkDownloadContext) {
    const metrics: LinkMetrics = {
      calls: 0,
      input: 0,
      output: 0,
      reservedUSD: 0,
    };
    const controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), LINK_TIMEOUT_MS);
    const start = Date.now();
    try {
      await context.assertAllowed();
      publicLink(url);
      let current = url;
      for (let step = 0; step < 3; step++) {
        const response = await this.network.get(current, signal);
        if ([401, 403].includes(response.status))
          throw new LinkDownloadError('LINK_ACCESS_REQUIRED');
        if ([404, 410].includes(response.status))
          throw new LinkDownloadError('LINK_EXPIRED');
        if (response.status !== 200)
          throw new LinkDownloadError('LINK_DOWNLOAD_UNAVAILABLE');
        if (response.bytes.subarray(0, 5).toString() === '%PDF-')
          return {
            bytes: await this.checked(response.bytes),
            metrics,
            ms: Date.now() - start,
          };
        if (response.type.includes('application/pdf'))
          throw new LinkDownloadError('LINK_INVALID_FILE');
        if (
          !response.type.includes('text/html') ||
          response.bytes.length > 1024 * 1024
        )
          throw new LinkDownloadError('LINK_INVALID_FILE');
        const data = staticCandidates(
          response.bytes.toString('utf8'),
          response.url,
        );
        this.assertPageAccessible(data.text);
        const embedded = data.candidates.filter((c) =>
          ['IFRAME', 'EMBED', 'OBJECT'].includes(c.tag),
        );
        const selected =
          embedded.length === 1
            ? embedded[0].id
            : chooseDeterministically(data.candidates);
        const candidate = data.candidates.find((c) => c.id === selected);
        if (!candidate?.url) {
          current = response.url;
          break;
        }
        await context.assertAllowed();
        current = candidate.url;
      }
      return {
        bytes: await this.browserDownload(current, context, metrics, signal),
        metrics,
        ms: Date.now() - start,
      };
    } catch (error) {
      const safe =
        error instanceof LinkDownloadError
          ? error
          : new LinkDownloadError('LINK_DOWNLOAD_UNAVAILABLE');
      Object.assign(safe, {
        metrics,
        ms: Date.now() - start,
        diagnostic:
          error instanceof LinkDownloadError
            ? undefined
            : /^[A-Z_]+$/.test(error?.code || '')
            ? error.code
            : error?.name,
      });
      throw safe;
    } finally {
      clearTimeout(timeout);
      controller.abort();
    }
  }
  private assertPageAccessible(text: string) {
    if (
      /link (?:has )?expired|קישור.*(?:פג|תוקף)|document (?:was )?removed/i.test(
        text,
      )
    )
      throw new LinkDownloadError('LINK_EXPIRED');
    if (
      /sign in to|log in to|access denied|permission required|התחבר.*(?:לצפייה|להורדה)|אין.*הרשאה|captcha/i.test(
        text,
      )
    )
      throw new LinkDownloadError('LINK_ACCESS_REQUIRED');
  }
  async checked(bytes: Buffer) {
    if (!bytes.length || bytes.length > LINK_MAX_BYTES)
      throw new LinkDownloadError('LINK_INVALID_FILE');
    const inspection = await this.pdf.inspect(bytes);
    if (!['readable', 'password_required'].includes(inspection.kind))
      throw new LinkDownloadError('LINK_INVALID_FILE');
    return bytes;
  }
  private executable() {
    return [
      process.env.EMAIL_LINK_BROWSER_EXECUTABLE,
      '/usr/local/bin/keepintax-link-browser',
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ].find((p) => p && existsSync(p));
  }
  private async browserDownload(
    url: string,
    context: LinkDownloadContext,
    metrics: LinkMetrics,
    signal: AbortSignal,
  ) {
    while (this.active >= 1 && !signal.aborted)
      await new Promise((r) => setTimeout(r, 100));
    if (signal.aborted)
      throw new LinkDownloadError('LINK_DOWNLOAD_UNAVAILABLE');
    this.active++;
    let browser: puppeteer.Browser;
    let proxy: Awaited<ReturnType<LinkNetwork['proxy']>>;
    let directory: string;
    let abort: () => void;
    try {
      const executablePath = this.executable();
      if (!executablePath)
        throw new LinkDownloadError('LINK_BROWSER_UNAVAILABLE');
      proxy = await this.network.proxy(signal);
      directory = await mkdtemp(join(tmpdir(), 'keepintax-link-'));
      // The image's node user has UID/GID 1000; only its browser may write downloads.
      if (process.platform === 'linux' && process.getuid?.() === 0)
        await chown(directory, 1000, 1000);
      // Separate process/profile; Chromium sandbox stays enabled. Never use the PDF renderer's browser.
      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        timeout: 10000,
        env: {
          PATH: process.env.PATH,
          HOME: tmpdir(),
          TMPDIR: tmpdir(),
          LANG: 'C.UTF-8',
          ...(process.platform === 'win32'
            ? { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR }
            : {}),
        },
        args: [
          '--proxy-server=' + proxy.url,
          '--proxy-bypass-list=<-loopback>',
          '--disable-quic',
          '--disable-background-networking',
          '--disable-dev-shm-usage',
          '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        ],
      });
      abort = () => {
        browser.process()?.kill('SIGKILL');
      };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) throw Error();
      const isolated = await browser.createBrowserContext({
        proxyServer: proxy.url,
        proxyBypassList: ['<-loopback>'],
        downloadBehavior: { policy: 'allowAndName', downloadPath: directory },
      });
      const page = await isolated.newPage();
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      let requests = 0,
        postOrigin: string | null = null,
        postRemaining = 0;
      let captured: Buffer | null = null;
      page.on('request', (request) => {
        void (async () => {
          if (
            request.url().startsWith('blob:') &&
            request.url().startsWith('blob:' + new URL(page.url()).origin + '/')
          )
            return request.continue();
          const u = publicLink(request.url());
          if (
            signal.aborted ||
            ++requests > 100 ||
            unsafeAction(decodeURIComponent(u.pathname)) ||
            ['image', 'media', 'font'].includes(request.resourceType())
          )
            return request.abort();
          if (request.method() !== 'GET' && request.method() !== 'HEAD') {
            if (
              request.method() !== 'POST' ||
              u.origin !== postOrigin ||
              postRemaining-- <= 0
            )
              return request.abort();
          }
          await request.continue();
        })().catch(() => {
          if (!request.isInterceptResolutionHandled())
            void request.abort().catch(() => {});
        });
      });
      page.on('response', (response) => {
        if (response.headers()['content-type']?.includes('application/pdf'))
          void (async () => {
            if (Number(response.headers()['content-length']) > LINK_MAX_BYTES)
              return;
            const bytes = await response.buffer();
            if (bytes.length <= LINK_MAX_BYTES) captured = bytes;
          })().catch(() => {});
      });
      const navigate = async (target: string) => {
        await page
          .goto(target, { waitUntil: 'domcontentloaded', timeout: 10000 })
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 350));
      };
      await navigate(url);
      const downloaded = async () => {
        if (captured) return this.checked(captured);
        for (const file of await readdir(directory)) {
          const path = join(directory, file);
          const info = await stat(path).catch((error) => {
            if (error.code === 'ENOENT') return null;
            throw error;
          });
          if (!info) continue;
          if (info.size > LINK_MAX_BYTES)
            throw new LinkDownloadError('LINK_INVALID_FILE');
          if (!file.endsWith('.crdownload') && info.isFile()) {
            const bytes = await readFile(path).catch((error) => {
              if (error.code === 'ENOENT') return null;
              throw error;
            });
            if (bytes) return this.checked(bytes);
          }
        }
        return null;
      };
      for (let step = 0; step < 3; step++) {
        const existing = await downloaded();
        if (existing) return existing;
        if (signal.aborted) throw Error();
        const data = await page.evaluate(() => {
          const visible = [
            ...document.querySelectorAll('a[href],button,input[type=submit]'),
          ]
            .filter(
              (n: HTMLElement) =>
                n.getClientRects().length &&
                getComputedStyle(n).visibility !== 'hidden',
            )
            .slice(0, 60);
          return {
            text: document.body.innerText.slice(0, 1600),
            candidates: visible.map((node: HTMLElement, i) => {
              node.setAttribute('data-keepintax-download', 'c' + i);
              return {
                id: 'c' + i,
                text: (
                  node.innerText ||
                  node.getAttribute('value') ||
                  node.getAttribute('aria-label') ||
                  ''
                )
                  .trim()
                  .slice(0, 160),
                tag: node.tagName,
                url: node.getAttribute('href') || undefined,
              };
            }),
          };
        });
        this.assertPageAccessible(data.text);
        if (await page.$('input[type=password]'))
          throw new LinkDownloadError('LINK_ACCESS_REQUIRED');
        const candidates = data.candidates.filter(
          (c) =>
            !unsafeAction(c.text) &&
            !unrelatedAction(c.text) &&
            (!c.url || !/^javascript:/i.test(c.url)),
        );
        let choice = chooseDeterministically(candidates);
        if (!choice) {
          await context.assertAllowed();
          choice = await this.selector.choose(
            candidates,
            data.text,
            metrics,
            signal,
            context.reserveModel,
          );
        }
        const selected = candidates.find((c) => c.id === choice);
        if (
          !selected ||
          !documentAction(selected.text + ' ' + (selected.url || '')) ||
          unsafeAction(selected.text)
        )
          throw new LinkDownloadError('LINK_MANUAL_REQUIRED');
        await context.assertAllowed();
        if (selected.url) publicLink(new URL(selected.url, page.url()).href);
        postOrigin = new URL(page.url()).origin;
        postRemaining = 1;
        await page
          .$eval(
            '[data-keepintax-download="' + choice + '"]',
            (node: HTMLElement) => node.click(),
          )
          .catch(() => {});
        for (let n = 0; n < 15 && !signal.aborted; n++) {
          await new Promise((r) => setTimeout(r, 100));
          const bytes = await downloaded();
          if (bytes) return bytes;
        }
        postOrigin = null;
      }
      throw new LinkDownloadError('LINK_MANUAL_REQUIRED');
    } finally {
      if (abort) signal.removeEventListener('abort', abort);
      if (browser) {
        const kill = setTimeout(() => browser.process()?.kill('SIGKILL'), 1500);
        try {
          await browser.close();
        } catch {
        } finally {
          clearTimeout(kill);
        }
      }
      if (proxy) await proxy.close();
      if (directory) await rm(directory, { recursive: true, force: true });
      this.active--;
    }
  }
}
