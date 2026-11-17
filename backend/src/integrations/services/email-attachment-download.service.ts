import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { Agent } from 'https';
import { lookup } from 'dns';
import { BlockList, isIP } from 'net';
import { EmailProviderError } from '../providers/email-provider.error';

const MAX_BYTES = 25 * 1024 * 1024;
const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 3]] as const) blocked.addSubnet(address, prefix);

export function isPublicDownloadAddress(address: string): boolean {
  if (isIP(address) === 4) return !blocked.check(address);
  // Only public global unicast IPv6; excludes mapped IPv4, loopback and private/link-local.
  return isIP(address) === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(db8|0):/i.test(address);
}

@Injectable()
export class EmailAttachmentDownloadService {
  async download(value: string): Promise<Buffer> {
    try {
      const url = new URL(value);
      const hosts = (process.env.COMPOSIO_DOWNLOAD_ALLOWED_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean);
      if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hosts.includes(url.hostname) || isIP(url.hostname)) throw new EmailProviderError('CONFIG');
      const agent = new Agent({ lookup: (hostname, options, callback) => {
        lookup(hostname, { all: true }, (error, addresses) => {
          if (error || !addresses.length || addresses.some(item => !isPublicDownloadAddress(item.address))) return callback(new Error('Blocked attachment destination'), undefined, undefined);
          // Prefer IPv4 when the host has DNS IPv6 but no outbound IPv6 route.
          const selected = addresses.find(item => item.family === 4) || addresses[0];
          if (typeof options === 'object' && options.all) (callback as Function)(null, [selected]);
          else callback(null, selected.address, selected.family);
        });
      } });
      const response = await axios.get(value, { responseType: 'stream', timeout: 30_000, signal: AbortSignal.timeout(30_000), maxRedirects: 0, proxy: false, httpsAgent: agent });
      if (Number(response.headers['content-length']) > MAX_BYTES) { response.data.destroy(); throw new EmailProviderError('CONTRACT'); }
      const chunks: Buffer[] = [];
      let length = 0;
      try {
        for await (const chunk of response.data) {
          const bytes = Buffer.from(chunk); length += bytes.length;
          if (length > MAX_BYTES) throw new EmailProviderError('CONTRACT');
          chunks.push(bytes);
        }
      } finally { response.data.destroy(); agent.destroy(); }
      if (!length) throw new EmailProviderError('CONTRACT');
      return Buffer.concat(chunks);
    } catch (error) {
      // URLs may contain signed credentials: never retain provider/HTTP error objects.
      throw error instanceof EmailProviderError ? error : new EmailProviderError('TRANSIENT');
    }
  }
}
