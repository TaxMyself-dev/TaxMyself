import axios from 'axios';
import { google } from 'googleapis';
import { DocumentPdfClient } from './document-pdf-client';
import { DocumentPdfRenderer } from './document-pdf-renderer.service';
import { DocumentPdfModel } from './document-pdf.template';
jest.mock('axios');
jest.mock('googleapis', () => ({
  google: { auth: { GoogleAuth: jest.fn() } },
}));
const document: DocumentPdfModel = {
  title: 'receipt',
  date: 'today',
  documentType: 'original',
  preview: true,
  items: [],
  totals: [],
  payments: [],
  paymentTotals: [],
};

describe('remote PDF dispatch', () => {
  const originalUrl = process.env.PDF_SERVICE_URL;
  const originalCloud = process.env.K_SERVICE;
  const tokenHeaders = jest.fn();
  beforeEach(() => {
    delete process.env.K_SERVICE;
    process.env.PDF_SERVICE_URL = 'https://pdf.example.test';
    jest.clearAllMocks();
    (google.auth.GoogleAuth as unknown as jest.Mock).mockImplementation(() => ({
      getIdTokenClient: jest
        .fn()
        .mockResolvedValue({ getRequestHeaders: tokenHeaders }),
    }));
    tokenHeaders.mockResolvedValue(
      new Map([['authorization', 'Bearer service-identity']]),
    );
    (axios.post as jest.Mock).mockResolvedValue({
      data: Buffer.from('%PDF-remote'),
      headers: { 'content-type': 'application/pdf' },
    });
  });
  afterAll(() => {
    if (originalUrl === undefined) delete process.env.PDF_SERVICE_URL;
    else process.env.PDF_SERVICE_URL = originalUrl;
    if (originalCloud === undefined) delete process.env.K_SERVICE;
    else process.env.K_SERVICE = originalCloud;
  });
  it('sends a versioned serializable job with IAM identity and bounded request', async () => {
    expect((await new DocumentPdfClient().render(document)).toString()).toBe(
      '%PDF-remote',
    );
    expect(axios.post).toHaveBeenCalledWith(
      'https://pdf.example.test/v1/render',
      expect.objectContaining({
        version: 1,
        requestId: expect.any(String),
        document,
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer service-identity',
        }),
        timeout: 60000,
        maxRedirects: 0,
      }),
    );
  });
  it('supports unauthenticated loopback only outside Cloud Run', async () => {
    process.env.PDF_SERVICE_URL = 'http://127.0.0.1:8082';
    await new DocumentPdfClient().render(document);
    expect(google.auth.GoogleAuth).not.toHaveBeenCalled();
    process.env.K_SERVICE = 'backend';
    await expect(new DocumentPdfClient().render(document)).rejects.toThrow(
      'URL',
    );
  });
  it.each([
    'http://pdf.example.test',
    'https://user:secret@pdf.example.test',
    'https://pdf.example.test/path',
    'https://pdf.example.test/?secret=x',
  ])('rejects unsafe endpoint %s', async (url) => {
    process.env.PDF_SERVICE_URL = url;
    await expect(new DocumentPdfClient().render(document)).rejects.toThrow(
      'URL',
    );
    expect(axios.post).not.toHaveBeenCalled();
  });
  it.each([503, 500, 403])(
    'sanitizes remote %s without retry or fallback',
    async (status) => {
      (axios.post as jest.Mock).mockRejectedValue({
        response: { status, data: 'customer and secret' },
      });
      await expect(new DocumentPdfClient().render(document)).rejects.toThrow(
        'service is unavailable',
      );
      expect(axios.post).toHaveBeenCalledTimes(1);
    },
  );
  it('maps render timeouts and rejects invalid response bytes', async () => {
    (axios.post as jest.Mock).mockRejectedValueOnce({
      response: { status: 504 },
    });
    await expect(new DocumentPdfClient().render(document)).rejects.toThrow(
      'timed out',
    );
    (axios.post as jest.Mock).mockResolvedValueOnce({
      data: Buffer.from('not pdf'),
      headers: { 'content-type': 'application/pdf' },
    });
    await expect(new DocumentPdfClient().render(document)).rejects.toThrow(
      'service is unavailable',
    );
  });
  it('fails closed when IAM identity is unavailable', async () => {
    tokenHeaders.mockRejectedValueOnce(Error('metadata secret'));
    await expect(new DocumentPdfClient().render(document)).rejects.toThrow(
      'service is unavailable',
    );
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('routes through remote renderer and never falls back after a failure', async () => {
    const remote = {
      render: jest.fn().mockRejectedValue(Error('remote down')),
    };
    const renderer = new DocumentPdfRenderer(remote as any);
    const local = jest.spyOn(renderer as any, 'fonts');
    await expect(renderer.render(document)).rejects.toThrow('remote down');
    expect(local).not.toHaveBeenCalled();
  });
  it('fails closed on Cloud Run when PDF service configuration is absent', async () => {
    delete process.env.PDF_SERVICE_URL;
    process.env.K_SERVICE = 'backend';
    await expect(new DocumentPdfRenderer().render(document)).rejects.toThrow(
      'PDF_SERVICE_URL',
    );
  });
});
