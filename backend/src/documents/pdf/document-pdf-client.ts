import {
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { google } from 'googleapis';
import { DocumentPdfModel } from './document-pdf.template';

/** Transport boundary: a future queued dispatcher can carry this same job. */
export interface PdfRenderJob {
  version: 1;
  requestId: string;
  document: DocumentPdfModel;
}

@Injectable()
export class DocumentPdfClient {
  private async identityHeaders(audience: string): Promise<any> {
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        (async () => {
          const auth = new google.auth.GoogleAuth();
          const client = await auth.getIdTokenClient(audience);
          return client.getRequestHeaders();
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                Object.assign(new Error('Service identity timeout'), {
                  code: 'ETIMEDOUT',
                }),
              ),
            10000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async render(document: DocumentPdfModel): Promise<Buffer> {
    const configured = process.env.PDF_SERVICE_URL;
    let base: URL;
    try {
      base = new URL(configured);
      if (
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        base.pathname !== '/'
      )
        throw new Error();
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
      if (
        base.protocol !== 'https:' &&
        !(local && base.protocol === 'http:' && !process.env.K_SERVICE)
      )
        throw new Error();
    } catch {
      throw new ServiceUnavailableException(
        'PDF service URL is missing or invalid.',
      );
    }
    const job: PdfRenderJob = { version: 1, requestId: randomUUID(), document };
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    try {
      // Only loopback development calls omit IAM. No shared secret or user token.
      if (base.protocol === 'https:') {
        const tokenHeaders = await this.identityHeaders(base.origin);
        const authorization =
          typeof (tokenHeaders as any).get === 'function'
            ? (tokenHeaders as any).get('authorization')
            : (tokenHeaders as any).Authorization ||
              (tokenHeaders as any).authorization;
        if (!authorization) throw new Error('Missing service identity');
        headers.Authorization = authorization;
      }
      const response = await axios.post(new URL('/v1/render', base).href, job, {
        headers,
        responseType: 'arraybuffer',
        timeout: 60000,
        maxBodyLength: 8 * 1024 * 1024,
        maxContentLength: 20 * 1024 * 1024,
        maxRedirects: 0,
        // An issuance request must never be automatically repeated by this client.
        validateStatus: (status) => status === 200,
      });
      const pdf = Buffer.from(response.data);
      if (
        !String(response.headers['content-type'])
          .toLowerCase()
          .startsWith('application/pdf') ||
        pdf.subarray(0, 5).toString() !== '%PDF-'
      )
        throw new Error('Invalid render response');
      return pdf;
    } catch (error) {
      // Never include upstream bodies, model data, tokens or Axios config.
      if (
        error?.code === 'ECONNABORTED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.response?.status === 504
      ) {
        throw new GatewayTimeoutException(
          'PDF generation timed out. Please try again.',
        );
      }
      throw new ServiceUnavailableException(
        'PDF generation service is unavailable. Please try again.',
      );
    }
  }
}
