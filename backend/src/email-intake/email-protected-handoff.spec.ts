import { ProtectedPdfWorker } from '../protected-pdf/protected-pdf.worker';
it('reserves managed ownership before moving a protected replacement into INBOX', async () => {
  const saved = [
    process.env.GMAIL_DURABLE_INTAKE_ENABLED,
    process.env.PROTECTED_PDF_DISPATCH_ENABLED,
  ];
  process.env.GMAIL_DURABLE_INTAKE_ENABLED = 'true';
  process.env.PROTECTED_PDF_DISPATCH_ENABLED = 'true';
  try {
    const events: string[] = [];
    const op: any = {
      id: 'op',
      protected_id: 7,
      firebase_id: 'owner',
      business_number: '123',
      replacement_import_id: 200,
      candidate_drive_id: 'file',
      status: 'PENDING',
      attempts: 0,
    };
    const store: any = {
      operation: async () => op,
      root: async () => ({ current_operation_id: 'op', status: 'REPLACED' }),
      transaction: async (fn: any) => fn({}),
      query: jest.fn(async (sql: string, args: any[]) => {
        if (sql.includes("status='DISPATCHING'")) op.lease_token = args[0];
        if (sql.includes("email_work_state='PROTECTED_DELIVERY'"))
          events.push('reserve');
        if (sql.includes("SET r.email_work_state='READY'"))
          events.push('ready');
        return { affectedRows: 1 };
      }),
    };
    const drive: any = {
      ensureProtectedFolders: async () => ({ staging: 'staging' }),
      getFolderParents: async () => ['staging'],
      moveFile: async () => {
        events.push('move');
      },
    };
    const service: any = {
      enabled: () => true,
      business: async () => ({
        driveFolderId: 'root',
        driveInboxFolderId: 'inbox',
        driveProcessedFolderId: 'processed',
      }),
    };
    await new ProtectedPdfWorker(service, store, drive).deliver('op');
    expect(events).toEqual(['reserve', 'move', 'ready']);
    expect(
      store.query.mock.calls.find(([sql]: any[]) =>
        sql.includes("email_work_state='PROTECTED_DELIVERY'"),
      )[1],
    ).toEqual([7, 'op', 200, 'owner', '123']);
  } finally {
    ['GMAIL_DURABLE_INTAKE_ENABLED', 'PROTECTED_PDF_DISPATCH_ENABLED'].forEach(
      (key, i) => {
        if (saved[i] === undefined) delete process.env[key];
        else process.env[key] = saved[i];
      },
    );
  }
});
