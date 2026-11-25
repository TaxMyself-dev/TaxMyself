import {
  chooseDeterministically,
  extractDocumentLinks,
  publicLink,
} from './link-policy';
import { publicAddress } from './link-network';
import { LinkSelector } from './link-selector';
import { LinkDownloader, staticCandidates } from './link-downloader.service';
import { LinkNetwork } from './link-network';
import * as dns from 'dns/promises';

describe('destination DNS validation', () => {
  afterEach(() => jest.restoreAllMocks());
  it('blocks DNS rebinding/mixed public-private answers before opening a socket', async () => {
    const lookup = jest.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ] as any);
    await expect(
      new LinkNetwork().address('https://docs.example.org/file'),
    ).rejects.toMatchObject({ code: 'LINK_UNSAFE_DESTINATION' });
    lookup.mockResolvedValue([
      { address: '169.254.169.254', family: 4 },
    ] as any);
    await expect(
      new LinkNetwork().address('https://docs.example.org/file'),
    ).rejects.toThrow();
  });
  it('pins an explicitly validated public answer and prefers IPv4', async () => {
    jest.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '2606:4700:4700::1111', family: 6 },
      { address: '8.8.8.8', family: 4 },
    ] as any);
    expect(
      (await new LinkNetwork().address('https://docs.example.org/file'))
        .address,
    ).toBe('8.8.8.8');
  });
  it('recognizes a generic view button when the email subject identifies an invoice', () => {
    const message: any = {
      id: 'm',
      payload: {
        mimeType: 'text/html',
        headers: [{ name: 'subject', value: 'Your invoice is ready' }],
        body: {
          data: Buffer.from(
            '<a href="https://tracking.example.org/opaque">Click here</a><a href="https://tracking.example.org/app">Download our app</a>',
          ).toString('base64url'),
        },
      },
    };
    expect(extractDocumentLinks(message).map((x) => x.url)).toEqual([
      'https://tracking.example.org/opaque',
    ]);
  });
});

describe('linked-document discovery and selection', () => {
  const mail = (html: string) => ({
    id: 'm',
    payload: {
      mimeType: 'text/html',
      body: { data: Buffer.from(html).toString('base64url') },
    },
  });
  it('extracts tracking URLs and HTML entities without executing email HTML', () => {
    const links = extractDocumentLinks(
      mail(
        '<script>fetch("https://bad.example/a.pdf")</script><a href="https://tracking.example/open?a=1&amp;b=2">הורדת חשבונית מקור</a><a href="https://tracking.example/open?a=1&amp;b=2">invoice</a>',
      ),
    );
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://tracking.example/open?a=1&b=2');
    expect(links[0].path).toMatch(/^link:[a-f\d]{64}$/);
  });
  it('keeps identity stable when unrelated MIME parts reorder', () => {
    const a = extractDocumentLinks(
      mail('<a href="https://docs.example/a.pdf">Download</a>'),
    );
    expect(
      extractDocumentLinks({
        id: 'm',
        payload: {
          parts: [
            { mimeType: 'image/png' },
            mail('<a href="https://docs.example/a.pdf">Download</a>').payload,
          ],
        },
      })[0].path,
    ).toBe(a[0].path);
  });
  it('does not queue dangerous schemes or unsubscribe/payment actions', () => {
    expect(
      extractDocumentLinks(
        mail(
          '<a href="javascript:alert(1)">invoice</a><a href="https://x.example/remove">Unsubscribe</a><a href="https://x.example/pay">Pay invoice</a>',
        ),
      ),
    ).toEqual([]);
  });
  it('prefers original, handles ambiguity, and does not choose destructive actions', () => {
    const original = { id: 'a', text: 'Download original', tag: 'A' };
    const copy = { id: 'b', text: 'Download true copy', tag: 'A' };
    expect(
      chooseDeterministically([
        original,
        copy,
        { id: 'c', text: 'Delete invoice', tag: 'BUTTON' },
      ]),
    ).toBe('a');
    expect(chooseDeterministically([copy, { ...copy, id: 'c' }])).toBeNull();
  });
  it('does not follow navigation just because the host or query contains document keywords', () => {
    const navigation = {
      id: 'back',
      text: 'כל התרחישים',
      tag: 'A',
      url: 'https://email-document-test-lab.example/?token=invoice',
    };
    expect(chooseDeterministically([navigation])).toBeNull();
    expect(
      chooseDeterministically([
        navigation,
        {
          id: 'pdf',
          text: '',
          tag: 'A',
          url: 'https://docs.example/files/invoice.pdf',
        },
      ]),
    ).toBe('pdf');
  });
  it.each([
    'http://docs.example/a.pdf',
    'https://user:secret@docs.example/a.pdf',
    'https://docs.example:444/a',
    'file:///etc/passwd',
    'https://localhost/a',
  ])('rejects %s', (url) => expect(() => publicLink(url)).toThrow());
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.0.1',
    '100.64.1.2',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    '2001:db8::1',
  ])('blocks private/reserved address %s', (ip) =>
    expect(publicAddress(ip)).toBe(false),
  );
  it('accepts ordinary public addresses', () => {
    expect(publicAddress('8.8.8.8')).toBe(true);
    expect(publicAddress('2606:4700:4700::1111')).toBe(true);
  });
  it('resolves relative PDF links and ignores executable HTML', () => {
    expect(
      staticCandidates(
        '<a href="/original.pdf">Download original</a><script>deleteAll()</script>',
        'https://docs.example/view',
      ).candidates[0].url,
    ).toBe('https://docs.example/original.pdf');
  });
});

describe('bounded model selection', () => {
  let fetchMock: jest.SpyInstance;
  const old = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'synthetic-test';
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    if (old === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = old;
  });
  it('reserves before paying and never sends signed URLs', async () => {
    let reserved = false;
    fetchMock.mockImplementation(async (_url, init) => {
      expect(reserved).toBe(true);
      expect(String(init.body)).not.toContain('secret-token');
      return {
        ok: true,
        json: async () => ({
          usage: { prompt_tokens: 200, completion_tokens: 6 },
          choices: [
            { finish_reason: 'stop', message: { content: '{"choice":"a"}' } },
          ],
        }),
      } as any;
    });
    const metrics = { calls: 0, input: 0, output: 0, reservedUSD: 0 };
    expect(
      await new LinkSelector().choose(
        [
          {
            id: 'a',
            text: 'Download invoice',
            url: 'https://docs.example/secret-token',
            tag: 'A',
          },
        ],
        'Document ready',
        metrics,
        new AbortController().signal,
        async () => {
          reserved = true;
        },
      ),
    ).toBe('a');
    expect(metrics).toMatchObject({ calls: 1, input: 200, output: 6 });
  });
  it('rejects exhausted budget and a third model call before sending', async () => {
    const selector = new LinkSelector();
    const reserve = jest.fn();
    await expect(
      selector.choose(
        [],
        '',
        { calls: 2, input: 0, output: 0, reservedUSD: 0 },
        new AbortController().signal,
        reserve,
      ),
    ).rejects.toMatchObject({ code: 'LINK_BUDGET_EXHAUSTED' });
    await expect(
      selector.choose(
        [],
        '',
        { calls: 0, input: 0, output: 0, reservedUSD: 0.01 },
        new AbortController().signal,
        reserve,
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
  });
  it('does not call the model if durable reservation fails', async () => {
    await expect(
      new LinkSelector().choose(
        [],
        '',
        { calls: 0, input: 0, output: 0, reservedUSD: 0 },
        new AbortController().signal,
        async () => {
          throw Error('lease lost');
        },
      ),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects invented IDs and truncated output', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        usage: { prompt_tokens: 100, completion_tokens: 6 },
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '{"choice":"invented"}' },
          },
        ],
      }),
    } as any);
    await expect(
      new LinkSelector().choose(
        [],
        '',
        { calls: 0, input: 0, output: 0, reservedUSD: 0 },
        new AbortController().signal,
        async () => {},
      ),
    ).rejects.toThrow();
  });
});

describe('HTTP-first linked PDF intake', () => {
  const context = {
    assertAllowed: jest.fn(async () => {}),
    reserveModel: jest.fn(async () => {}),
  };
  it('downloads a direct PDF without a browser/model and rejects HTML disguised as PDF', async () => {
    const network: any = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        type: 'application/pdf',
        url: 'https://docs.example/a',
        bytes: Buffer.from('%PDF-fixture'),
      }),
    };
    const selector: any = { choose: jest.fn() };
    const pdf: any = {
      inspect: jest.fn().mockResolvedValue({ kind: 'readable', pages: 1 }),
    };
    const service = new LinkDownloader(network, selector, pdf);
    expect(
      (await service.download('https://docs.example/a', context)).metrics.calls,
    ).toBe(0);
    expect(selector.choose).not.toHaveBeenCalled();
    network.get.mockResolvedValue({
      status: 200,
      type: 'application/pdf',
      bytes: Buffer.from('<html>login</html>'),
    });
    await expect(
      service.download('https://docs.example/a', context),
    ).rejects.toMatchObject({ code: 'LINK_INVALID_FILE' });
  });
  it('follows an original download link without model selection', async () => {
    const network: any = {
      get: jest
        .fn()
        .mockResolvedValueOnce({
          status: 200,
          type: 'text/html',
          url: 'https://docs.example/view',
          bytes: Buffer.from(
            '<a href="/original.pdf">Original invoice</a><a href="/copy.pdf">Copy</a>',
          ),
        })
        .mockResolvedValueOnce({
          status: 200,
          type: 'application/pdf',
          bytes: Buffer.from('%PDF-fixture'),
        }),
    };
    const service = new LinkDownloader(
      network,
      {} as any,
      { inspect: async () => ({ kind: 'readable', pages: 1 }) } as any,
    );
    expect(
      (
        await service.download('https://docs.example/view', context)
      ).bytes.toString(),
    ).toBe('%PDF-fixture');
    expect(network.get.mock.calls[1][0]).toBe(
      'https://docs.example/original.pdf',
    );
  });
  it.each([
    [403, 'LINK_ACCESS_REQUIRED'],
    [410, 'LINK_EXPIRED'],
    [503, 'LINK_DOWNLOAD_UNAVAILABLE'],
  ])(
    'classifies HTTP %s without alleging permission for every failure',
    async (status, code) => {
      const service = new LinkDownloader(
        { get: async () => ({ status }) } as any,
        {} as any,
        {} as any,
      );
      await expect(
        service.download('https://docs.example/view', context),
      ).rejects.toMatchObject({ code });
    },
  );
  it('preserves encrypted PDFs for the existing password-required lifecycle', async () => {
    const bytes = Buffer.from('%PDF-encrypted');
    const service = new LinkDownloader(
      {} as any,
      {} as any,
      { inspect: async () => ({ kind: 'password_required' }) } as any,
    );
    expect(await service.checked(bytes)).toBe(bytes);
  });
});

describe('mail link relevance',()=>{
  const mail=(subject:string,body:string):any=>({id:'m',payload:{mimeType:'text/html',headers:[{name:'Subject',value:subject}],body:{data:Buffer.from(body).toString('base64url')}}});
  it.each(['לצפייה במשרה','לצפייה בכל המשרות','לצפייה בשיעור','לצפייה בדפדפן לחץ כאן'])('ignores unrelated view links: %s',label=>{
    expect(extractDocumentLinks(mail('עדכונים חדשים', '<a href="https://example.org/view?token=invoice">'+label+'</a>'))).toEqual([]);
  });
  it('retains generic view actions in accounting mail and explicit PDF paths',()=>{
    expect(extractDocumentLinks(mail('החשבונית שלך','<a href="https://example.org/view/opaque">לצפייה</a>'))).toHaveLength(1);
    expect(extractDocumentLinks(mail('מסמך','<a href="https://example.org/files/a.pdf">פתח</a>'))).toHaveLength(1);
  });
});

it('retains a generic view control within an already-discovered document page',()=>{
 expect(chooseDeterministically([{id:'view',text:'לצפייה',tag:'BUTTON'}])).toBe('view');
});
