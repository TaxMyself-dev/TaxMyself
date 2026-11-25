import { EmailIntakeRunsService } from '../email-intake-runs.service';
import { EmailIntakeStore } from '../email-intake.store';
import { LinkDownloadError } from './link-policy';
import { LinkManualService } from './link-manual.service';
import { LinkManualController } from './link-manual.controller';
import { GmailReaderService } from '../../integrations/services/gmail-reader.service';

describe('durable linked source integration', () => {
  const run: any = {
    id: 'run',
    firebase_id: 'owner',
    business_number: '123',
    integration_id: 17,
    scan_state: 'DONE',
    query_text: 'after:100',
    started_at: new Date(),
  };
  const item: any = {
    id: 'item',
    message_id: 'message',
    part_path: 'link:' + 'a'.repeat(64),
    filename: 'linked.pdf',
    mime_type: 'application/pdf',
    source_metadata_json: { gmailFrom: 'supplier@example.org' },
  };
  function setup() {
    const events: string[] = [];
    const store: any = {
      enabled: () => true,
      leaseRun: async () => 'token',
      withLinkLock: async (_id, operation) => operation(),
      items: async (_id, kind) => (kind === 'part' ? [item] : []),
      beginLink: jest.fn(async () => {
        events.push('reserved');
        return true;
      }),
      linkTelemetry: jest.fn(async () => {}),
      finishItem: jest.fn(),
      summary: async () => ({ messages: {}, attachments: { BLOCKED: 1 } }),
      refreshRun: async () => ({ pull: 'RUNNING' }),
      query: async (sql) =>
        sql.startsWith('SELECT *') ? [run] : { affectedRows: 1 },
    };
    const reader: any = {
      assertLinkedSource: jest.fn(async () => 'https://docs.example.org/view'),
    };
    const integrations: any = {
      findOwnedByIdOrThrow: async () => ({ status: 'ACTIVE' }),
    };
    const storage: any = {
      accept: jest.fn(async () => ({ id: 99, duplicate: false })),
    };
    const routing: any = { assertAllowed: jest.fn(async () => {}) };
    const links: any = {
      download: jest.fn(async (_url, ctx) => {
        expect(events).toEqual(['reserved']);
        await ctx.assertAllowed();
        await ctx.reserveModel();
        return {
          bytes: Buffer.from('%PDF-fixture'),
          metrics: { calls: 1, input: 100, output: 6, reservedUSD: 0.001 },
          ms: 10,
        };
      }),
    };
    return {
      store,
      reader,
      storage,
      routing,
      links,
      service: new EmailIntakeRunsService(
        store,
        reader,
        integrations,
        {} as any,
        storage,
        routing,
        links,
      ),
    };
  }
  it('reserves first, rechecks rules and hands downloaded bytes to existing storage', async () => {
    const t = setup();
    await t.service.step(run);
    expect(t.routing.assertAllowed).toHaveBeenCalledWith(
      'owner',
      17,
      'supplier@example.org',
    );
    expect(t.storage.accept).toHaveBeenCalledWith(
      run,
      item,
      Buffer.from('%PDF-fixture'),
    );
    expect(t.store.finishItem).toHaveBeenCalledWith(
      run,
      'token',
      item,
      'IMPORTED',
      99,
    );
  });
  it('retains a classified failure for manual upload rather than retrying paid work', async () => {
    const t = setup();
    t.links.download.mockRejectedValue(
      new LinkDownloadError('LINK_ACCESS_REQUIRED'),
    );
    await t.service.step(run);
    expect(t.store.finishItem).toHaveBeenCalledWith(
      run,
      'token',
      item,
      'BLOCKED',
      undefined,
      'LINK_ACCESS_REQUIRED',
    );
    expect(t.storage.accept).not.toHaveBeenCalled();
  });
  it('does not repeat an interrupted attempt whose source reservation is already consumed', async () => {
    const t = setup();
    t.store.beginLink.mockResolvedValue(false);
    await t.service.step(run);
    expect(t.links.download).not.toHaveBeenCalled();
  });
  it('does not recreate a linked source in later date-window runs', async () => {
    const query = jest.fn(async (sql: string) =>
      sql.includes('SELECT * FROM email_import_runs')
        ? [{ lease_token: 'token' }]
        : sql.includes('SELECT i.id')
        ? [{ id: 'prior' }]
        : { affectedRows: 1 },
    );
    const store = new EmailIntakeStore({
      transaction: async (fn) => fn({ query }),
    } as any);
    await store.recordParts(
      run,
      'token',
      { id: 'message-item', message_id: 'message' } as any,
      [
        {
          path: item.part_path,
          filename: 'linked.pdf',
          mimeType: 'application/pdf',
        },
      ],
    );
    expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
      false,
    );
    expect(
      (query.mock.calls.find(([sql]) => sql.includes('SELECT i.id')) as any)[1],
    ).toEqual(['owner', 17, 'message', item.part_path, 'run']);
  });
  it('discovers links on a MIME body without any attachment and revalidates source identity', async () => {
    const provider: any = {
      getMessage: jest.fn(async () => ({
        id: 'm',
        payload: {
          mimeType: 'text/html',
          body: {
            data: Buffer.from(
              '<a href="https://docs.example.org/doc.pdf">Download invoice</a>',
            ).toString('base64url'),
          },
          headers: [{ name: 'From', value: 'supplier@example.org' }],
        },
      })),
    };
    const reader = new GmailReaderService({} as any, provider);
    const integration: any = {
      status: 'ACTIVE',
      connectionBackend: 'COMPOSIO',
      connectedAccountId: 'ca',
      firebaseId: 'owner',
    };
    const parts = await reader.durableParts(integration, 'm');
    expect(parts).toHaveLength(1);
    expect(parts[0].path).toMatch(/^link:/);
    expect(
      await reader.assertLinkedSource(integration, 'm', parts[0].path),
    ).toBe('https://docs.example.org/doc.pdf');
    await expect(
      reader.assertLinkedSource(integration, 'm', 'link:changed'),
    ).rejects.toThrow();
  });
});

describe('shared scanner/manual source lock', () => {
  it('holds the same per-source advisory lock through the operation and releases on failure', async () => {
    const query = jest.fn().mockResolvedValue([{ acquired: 1 }]);
    const release = jest.fn();
    const runner: any = { connect: jest.fn(), query, release };
    const store = new EmailIntakeStore({
      createQueryRunner: () => runner,
    } as any);
    await expect(
      store.withLinkLock('item', async () => {
        expect(query).toHaveBeenCalledWith('SELECT GET_LOCK(?,0) AS acquired', [
          'email-link-item',
        ]);
        throw Error('operation interrupted');
      }),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      'email-link-item',
    ]);
    expect(release).toHaveBeenCalled();
  });
  it('does not start a download while a manual upload owns the source lock', async () => {
    const operation = jest.fn();
    const runner: any = {
      connect: jest.fn(),
      query: jest.fn(async () => [{ acquired: 0 }]),
      release: jest.fn(),
    };
    const store = new EmailIntakeStore({
      createQueryRunner: () => runner,
    } as any);
    expect(await store.withLinkLock('item', operation)).toBeNull();
    expect(operation).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });
});

describe('manual linked-document handling', () => {
  function setup() {
    const row: any = {
      id: 'item',
      run_id: 'run',
      firebase_id: 'owner',
      business_number: '123',
      integration_id: 17,
      state: 'BLOCKED',
      source_metadata_json: {
        documentLink: 'https://docs.example.org/signed-secret',
        gmailSubject: 'Invoice',
        gmailFrom: 'supplier@example.org',
      },
    };
    const runner: any = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) =>
        sql.includes('GET_LOCK')
          ? [{ acquired: 1 }]
          : sql.startsWith('SELECT i.*')
          ? [row]
          : { affectedRows: 1 },
      ),
    };
    const store: any = {
      db: { createQueryRunner: () => runner },
      workerScope: null,
      refreshRun: jest.fn(),
      query: jest.fn(async () => [row]),
    };
    const routing: any = {
      ownedBusinesses: async () => [{ businessNumber: '123' }],
      initial: jest.fn(async () => ({ initialBusiness: '123' })),
      assertAllowed: jest.fn(async () => {}),
    };
    const storage: any = {
      accept: jest.fn(async () => ({ id: 99, duplicate: false })),
    };
    const downloader: any = { checked: jest.fn(async () => {}) };
    return {
      row,
      runner,
      store,
      routing,
      storage,
      downloader,
      service: new LinkManualService(store, storage, routing, downloader),
    };
  }
  const file: any = {
    buffer: Buffer.from('%PDF-fixture'),
    originalname: 'manual.pdf',
  };
  it('lists pending rows without exposing signed URLs', async () => {
    const t = setup();
    const result = await t.service.list('owner', '123');
    expect(result.items).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('signed-secret');
    expect(t.store.query.mock.calls[0][1][0]).toBe('owner');
  });
  it('preserves the source and refreshes the blocked run after an upload', async () => {
    const t = setup();
    expect(await t.service.replace('owner', 'item', '123', file)).toEqual({
      accepted: true,
      alreadyHandled: false,
    });
    expect(t.storage.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run',
        firebase_id: 'owner',
        business_number: '123',
      }),
      expect.objectContaining({
        id: 'item',
        source_metadata_json: t.row.source_metadata_json,
      }),
      file.buffer,
    );
    expect(t.store.refreshRun).toHaveBeenCalled();
    expect(t.runner.release).toHaveBeenCalled();
    expect(t.runner.query).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', [
      'email-link-item',
    ]);
  });
  it('rejects cross-business handling and a new sender block before storing', async () => {
    const t = setup();
    await expect(
      t.service.replace('owner', 'item', 'other', file),
    ).rejects.toThrow();
    expect(t.storage.accept).not.toHaveBeenCalled();
    t.routing.assertAllowed.mockRejectedValue(Error('blocked'));
    await expect(
      t.service.replace('owner', 'item', '123', file),
    ).rejects.toThrow();
    expect(t.storage.accept).not.toHaveBeenCalled();
  });
  it('does not attach/upload again after a successful retry', async () => {
    const t = setup();
    t.row.state = 'IMPORTED';
    expect(await t.service.replace('owner', 'item', '123', file)).toMatchObject(
      { alreadyHandled: true },
    );
    expect(t.storage.accept).not.toHaveBeenCalled();
  });
  it('does not resolve the pending item when storage fails', async () => {
    const t = setup();
    t.storage.accept.mockRejectedValue(Error('storage unavailable'));
    await expect(
      t.service.replace('owner', 'item', '123', file),
    ).rejects.toThrow();
    expect(
      t.runner.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE')),
    ).toBe(false);
  });
  it('rejects simultaneous uploads and active scanner leases', async () => {
    const t = setup();
    t.runner.query.mockResolvedValueOnce([{ acquired: 0 }]);
    await expect(
      t.service.replace('owner', 'item', '123', file),
    ).rejects.toThrow();
    expect(t.storage.accept).not.toHaveBeenCalled();
    t.row.run_lease = 'active';
    t.row.run_lease_expires = new Date(Date.now() + 60000);
    await expect(
      t.service.replace('owner', 'item', '123', file),
    ).rejects.toThrow();
    expect(t.storage.accept).not.toHaveBeenCalled();
  });
  it('rejects delegated or admin mailbox access on every endpoint', () => {
    const api: any = {
      list: jest.fn(),
      original: jest.fn(),
      replace: jest.fn(),
    };
    const controller = new LinkManualController(api);
    for (const request of [
      { user: { firebaseId: 'owner' }, isDelegatedAccess: true },
      { user: { firebaseId: 'owner' }, isAdminImpersonation: true },
      { user: { firebaseId: 'owner', actorFirebaseId: 'other' } },
    ]) {
      expect(() => controller.list(request as any, '123')).toThrow();
      expect(() =>
        controller.upload(request as any, 'item', '123', file),
      ).toThrow();
    }
    expect(api.list).not.toHaveBeenCalled();
    expect(api.replace).not.toHaveBeenCalled();
  });
});
