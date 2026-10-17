import * as puppeteer from 'puppeteer-core';
import { DocumentPdfRenderer } from './document-pdf-renderer.service';
import { DocumentPdfModel } from './document-pdf.template';
jest.mock('puppeteer-core');
const model: DocumentPdfModel = {
  title: 'קבלה 1',
  documentType: 'מקור',
  date: '12-10-2026',
  preview: true,
  items: [],
  payments: [],
  totals: [],
  paymentTotals: [],
};
describe('PDF rendering resource isolation', () => {
  let renderer: DocumentPdfRenderer;
  let page: any, browser: any, context: any;
  beforeEach(() => {
    renderer = new DocumentPdfRenderer();
    (renderer as any).fonts = () => '';
    (renderer as any).executable = () => 'test-chromium';
    page = {
      setJavaScriptEnabled: jest.fn(),
      setRequestInterception: jest.fn(),
      on: jest.fn(),
      setContent: jest.fn(),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
    };
    context = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    browser = { connected: true, createBrowserContext: jest.fn().mockResolvedValue(context), close: jest.fn() };
    (puppeteer.launch as jest.Mock).mockResolvedValue(browser);
  });
  afterEach(async () => { await renderer.onModuleDestroy(); jest.clearAllMocks(); });
  it('disables scripts, blocks external requests, returns bytes and closes context', async () => {
    expect((await renderer.render(model)).toString()).toBe('%PDF-test');
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(context.close).toHaveBeenCalledTimes(1);
    const handler = page.on.mock.calls[0][1];
    const request = {
      url: () => 'http://169.254.169.254/',
      abort: jest.fn(),
      continue: jest.fn(),
    };
    handler(request);
    expect(request.abort).toHaveBeenCalledTimes(1);
    expect(request.continue).not.toHaveBeenCalled();
  });
  it('supports a root Cloud Run process without relying on a Docker marker', async () => {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform');
    const uid = Object.getOwnPropertyDescriptor(process, 'getuid');
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    Object.defineProperty(process, 'getuid', { value: () => 0, configurable: true });
    try {
      await renderer.render(model);
      expect(puppeteer.launch).toHaveBeenCalledWith(
        expect.objectContaining({ args: expect.arrayContaining(['--no-sandbox']) }),
      );
      expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
      expect(page.setRequestInterception).toHaveBeenCalledWith(true);
    } finally {
      Object.defineProperty(process, 'platform', platform);
      if (uid) Object.defineProperty(process, 'getuid', uid);
      else delete process.getuid;
    }
  });
  it('releases capacity and browser on rendering errors', async () => {
    page.pdf.mockRejectedValueOnce(new Error('render failed'));
    await expect(renderer.render(model)).rejects.toThrow('render failed');
    expect(context.close).toHaveBeenCalledTimes(1);
    await expect(renderer.render(model)).resolves.toBeInstanceOf(Buffer);
  });
  it('reuses Chromium with a fresh context for each render', async () => {
    await renderer.render(model); await renderer.render(model);
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
    expect(context.close).toHaveBeenCalledTimes(2);
    expect(browser.close).not.toHaveBeenCalled();
    expect(page.setContent).toHaveBeenCalledWith(expect.any(String), { waitUntil: 'networkidle0', timeout: 30000 });
  });
  it('shares one launch for concurrent requests', async () => {
    await Promise.all([renderer.render(model), renderer.render(model)]);
    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    expect(browser.createBrowserContext).toHaveBeenCalledTimes(2);
  });
  it('relaunches after a disconnected browser', async () => {
    await renderer.render(model); browser.connected = false;
    await renderer.render(model);
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });
  it('retries launch after failure without leaking capacity', async () => {
    (puppeteer.launch as jest.Mock).mockRejectedValueOnce(new Error('launch failed'));
    await expect(renderer.render(model)).rejects.toThrow('launch failed');
    await expect(renderer.render(model)).resolves.toBeInstanceOf(Buffer);
  });
  it('retires a browser when context cleanup fails', async () => {
    context.close.mockRejectedValueOnce(new Error('close failed'));
    await renderer.render(model);
    expect(browser.close).toHaveBeenCalledTimes(1);
    await renderer.render(model);
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });
  it('closes Chromium on module destruction', async () => {
    await renderer.render(model); await renderer.onModuleDestroy();
    expect(browser.close).toHaveBeenCalledTimes(1);
    await expect(renderer.render(model)).rejects.toThrow('closed');
  });
  it('rejects excessive input before launching browser', async () => {
    await expect(
      renderer.render({ ...model, items: Array(1001).fill({}) }),
    ).rejects.toThrow('too many rows');
    expect(puppeteer.launch).not.toHaveBeenCalled();
  });
});
