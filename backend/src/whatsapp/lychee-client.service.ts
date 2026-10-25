import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

export const LYCHEE_MAX_BYTES = 10 * 1024 * 1024;

/** Never attach API credentials to media URLs, follow redirects, or send messages. */
@Injectable()
export class LycheeClient {
  async download(
    messageId: string,
  ): Promise<{ content: Buffer; filename: string; mimeType: string }> {
    const key = process.env.LYCHEE_API_KEY;
    if (!key) throw new Error('Lychee API key unavailable');
    const metadata = await axios.get(
      'https://app.lychee-ltd.com/api/wap/get_message_media',
      {
        params: { message_id: messageId },
        headers: { Authorization: `Bearer ${key}` },
        timeout: 10000,
        maxRedirects: 0,
        maxContentLength: 65536,
      },
    );
    const url = new URL(metadata.data.url);
    const allowed = (process.env.LYCHEE_MEDIA_HOSTS || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      isIP(url.hostname) ||
      !allowed.includes(url.hostname)
    )
      throw new Error('Untrusted media host');
    const addresses = await lookup(url.hostname, { all: true });
    // Pin the resolved public IPv4 address for this request (prevent DNS rebinding).
    const address = addresses.find(
      (x) => x.family === 4 && publicIpv4(x.address),
    );
    if (
      !address ||
      addresses.some((x) => x.family !== 4 || !publicIpv4(x.address))
    ) {
      throw new Error('Non-public media destination');
    }
    const https = await import('https');
    const agent = new https.Agent({
      lookup: ((_host: string, _options: any, cb: any) =>
        cb(null, address.address, 4)) as any,
    });
    try {
      const result = await axios.get(url.href, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxRedirects: 0,
        maxContentLength: LYCHEE_MAX_BYTES,
        maxBodyLength: LYCHEE_MAX_BYTES,
        httpsAgent: agent,
        proxy: false,
        headers: { 'Accept-Encoding': 'identity' },
      });
      const content = Buffer.from(result.data);
      const mimeType = detectLycheeMime(content);
      const filename = String(
        metadata.data.file_name ||
          `document.${
            mimeType === 'application/pdf'
              ? 'pdf'
              : mimeType === 'image/png'
              ? 'png'
              : 'jpg'
          }`,
      )
        .replace(/[\\/\u0000-\u001f\u007f]/g, '-')
        .slice(0, 200);
      return { content, filename, mimeType };
    } finally {
      agent.destroy();
    }
  }
}

function publicIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function detectLycheeMime(content: Buffer): string {
  if (!content.length || content.length > LYCHEE_MAX_BYTES)
    throw new Error('Invalid media size');
  if (content.subarray(0, 5).toString('ascii') === '%PDF-')
    return 'application/pdf';
  if (
    content
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (content[0] === 255 && content[1] === 216 && content[2] === 255)
    return 'image/jpeg';
  throw new Error('Unsupported media content');
}
