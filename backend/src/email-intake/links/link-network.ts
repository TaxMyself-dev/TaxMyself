import { Injectable } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { request, Agent } from 'https';
import { createServer } from 'http';
import { connect, Socket, BlockList, isIP } from 'net';
import { LinkDownloadError, LINK_MAX_BYTES, publicLink } from './link-policy';

const blocked = new BlockList();
for (const [ip, mask] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(ip, mask);
export function publicAddress(ip: string) {
  return isIP(ip) === 4
    ? !blocked.check(ip)
    : isIP(ip) === 6 &&
        /^[23][a-f\d]{3}:/i.test(ip) &&
        !/^(?:2001:(?:0:|db8:)|2002:|3fff:)/i.test(ip);
}
@Injectable()
export class LinkNetwork {
  async address(value: string) {
    const url = publicLink(value);
    let timer: ReturnType<typeof setTimeout>;
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true }).catch(() => []),
      new Promise<Array<{ address: string; family: number }>>((resolve) => {
        timer = setTimeout(() => resolve([]), 5000);
      }),
    ]).finally(() => clearTimeout(timer));
    if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
      throw new LinkDownloadError('LINK_UNSAFE_DESTINATION');
    return {
      url,
      address:
        addresses.find((a) => a.family === 4)?.address || addresses[0].address,
    };
  }
  async get(
    value: string,
    signal: AbortSignal,
    maximum = LINK_MAX_BYTES,
  ): Promise<{ url: string; status: number; type: string; bytes: Buffer }> {
    let current = value;
    for (let hop = 0; hop <= 5; hop++) {
      const { url, address } = await this.address(current);
      if (signal.aborted)
        throw new LinkDownloadError('LINK_DOWNLOAD_UNAVAILABLE');
      const agent = new Agent({
        lookup: (_host, options, callback) => {
          const family = isIP(address);
          if (typeof options === 'object' && options.all)
            (callback as Function)(null, [{ address, family }]);
          else callback(null, address, family);
        },
      });
      let response: any;
      try {
        response = await new Promise<any>((resolve, reject) => {
          const req = request(
            url,
            {
              agent,
              signal,
              timeout: 12000,
              headers: {
                'User-Agent': 'Keepintax-Document-Download/1.0',
                Accept: 'application/pdf,text/html;q=0.9',
              },
            },
            resolve,
          );
          req.on('timeout', () => req.destroy(new Error('timeout')));
          req.on('error', reject);
          req.end();
        });
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          if (!response.headers.location)
            throw new LinkDownloadError('LINK_DOWNLOAD_UNAVAILABLE');
          current = new URL(response.headers.location, url).href;
          continue;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        if (Number(response.headers['content-length']) > maximum)
          throw new LinkDownloadError('LINK_INVALID_FILE');
        for await (const chunk of response) {
          size += chunk.length;
          if (size > maximum) throw new LinkDownloadError('LINK_INVALID_FILE');
          chunks.push(Buffer.from(chunk));
        }
        return {
          url: url.href,
          status: response.statusCode,
          type: String(response.headers['content-type'] || ''),
          bytes: Buffer.concat(chunks),
        };
      } finally {
        response?.destroy();
        agent.destroy();
      }
    }
    throw new LinkDownloadError('LINK_DOWNLOAD_UNAVAILABLE');
  }
  async proxy(signal: AbortSignal) {
    const sockets = new Set<Socket>();
    let transferred = 0,
      connections = 0;
    const server = createServer((_req, res) => {
      res.writeHead(403);
      res.end();
    });
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.on('connect', (req, client: Socket, head) => {
      void (async () => {
        if (
          ++connections > 80 ||
          signal.aborted ||
          !req.url ||
          !/^[a-z\d.-]+:443$/i.test(req.url)
        )
          throw Error();
        const { address } = await this.address('https://' + req.url);
        if (signal.aborted) throw Error();
        const upstream = connect({ host: address, port: 443 });
        sockets.add(upstream);
        upstream.on('close', () => sockets.delete(upstream));
        upstream.setTimeout(12000, () => upstream.destroy());
        upstream.on('error', () => client.destroy());
        client.on('error', () => upstream.destroy());
        client.on('close', () => upstream.destroy());
        upstream.on('data', (chunk) => {
          transferred += chunk.length;
          if (transferred > 30 * 1024 * 1024) {
            upstream.destroy();
            client.destroy();
          }
        });
        upstream.once('connect', () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) upstream.write(head);
          client.pipe(upstream);
          upstream.pipe(client);
        });
      })().catch(() => client.destroy());
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const close = async () => {
      for (const socket of sockets) socket.destroy();
      if (server.listening)
        await new Promise<void>((r) => server.close(() => r()));
    };
    const abort = () => {
      void close();
    };
    signal.addEventListener('abort', abort, { once: true });
    return {
      url: 'http://127.0.0.1:' + (server.address() as any).port,
      close: async () => {
        signal.removeEventListener('abort', abort);
        await close();
      },
    };
  }
}
