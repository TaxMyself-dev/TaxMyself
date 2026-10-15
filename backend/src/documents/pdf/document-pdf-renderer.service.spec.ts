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
  let page: any, browser: any;
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
    browser = { newPage: jest.fn().mockResolvedValue(page), close: jest.fn() };
    (puppeteer.launch as jest.Mock).mockResolvedValue(browser);
  });
  afterEach(() => jest.clearAllMocks());
  it('disables scripts, blocks external requests, returns bytes and closes Chromium', async () => {
    expect((await renderer.render(model)).toString()).toBe('%PDF-test');
    expect(page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(browser.close).toHaveBeenCalledTimes(1);
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
    expect(browser.close).toHaveBeenCalledTimes(1);
    await expect(renderer.render(model)).resolves.toBeInstanceOf(Buffer);
  });
  it('rejects excessive input before launching browser', async () => {
    await expect(
      renderer.render({ ...model, items: Array(1001).fill({}) }),
    ).rejects.toThrow('too many rows');
    expect(puppeteer.launch).not.toHaveBeenCalled();
  });
});
