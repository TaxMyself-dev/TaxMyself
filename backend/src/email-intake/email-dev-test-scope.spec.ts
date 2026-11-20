import { EmailIntakeStore } from './email-intake.store';
import { EmailProcessingWorker } from './email-processing.worker';
import { EmailIntakeRunsService } from './email-intake-runs.service';
describe('DEV UI Gmail test scope', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.DB_DATABASE = 'keepintax-dev';
    process.env.COMPOSIO_ENVIRONMENT = 'dev';
    process.env.NODE_ENV = 'test';
    process.env.GMAIL_DURABLE_INTAKE_ENABLED = 'true';
    process.env.GMAIL_DURABLE_PROCESS_ENABLED = 'true';
    process.env.GMAIL_DURABLE_DELETE_ENABLED = 'true';
    process.env.GMAIL_DURABLE_DEV_TEST_SUBJECT = 'KEEPINTAX-DEV-UI-20261120-A1';
    delete process.env.GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS;
    delete process.env.GMAIL_DURABLE_REQUIRED_BUSINESS_NUMBER;
  });
  afterEach(() => { process.env = { ...original }; });
  function setup() {
    const store = { enabled: () => true, createRun: jest.fn(async x => x) };
    const importer = { resolveEmailBusiness: jest.fn(async () => 'business') };
    const service = new EmailIntakeRunsService(store as any, {} as any, {} as any, importer as any, {} as any);
    const account = { id: 17, status: 'ACTIVE', connectionBackend: 'COMPOSIO', firebaseId: 'owner' } as any;
    return { store, importer, service, account };
  }
  it('freezes the DEV subject for a UI request instead of scanning the broad mailbox', async () => {
    const t = setup();
    const result = await t.service.start(t.account, { type: 'MANUAL' });
    expect(result.query).toBe('has:attachment subject:"KEEPINTAX-DEV-UI-20261120-A1"');
    expect(result.integrationId).toBe(17);
    expect(result.business).toBe('business');
  });
  it.each(['DB_DATABASE', 'COMPOSIO_ENVIRONMENT', 'NODE_ENV', 'GMAIL_DURABLE_DEV_TEST_SUBJECT'])('fails closed for invalid %s before DB creation', async key => {
    process.env[key] = key === 'NODE_ENV' ? 'production' : 'invalid';
    const t = setup();
    await expect(t.service.start(t.account, {})).rejects.toThrow('DEV-only');
    expect(t.store.createRun).not.toHaveBeenCalled();
    expect(t.importer.resolveEmailBusiness).not.toHaveBeenCalled();
  });
  it('preserves normal query behavior when the optional DEV setting is absent', async () => {
    delete process.env.GMAIL_DURABLE_DEV_TEST_SUBJECT;
    const t = setup();
    const result = await t.service.start(t.account, { query: 'has:attachment after:100 before:200' });
    expect(result.query).toBe('has:attachment after:100 before:200');
  });
  it('filters queue selection by the exact test run query and owner/business', async () => {
    const db = { query: jest.fn(async (..._args: any[]) => []) };
    await new EmailIntakeStore(db as any).dueWork();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('r.firebase_id=imported_documents.firebase_id'), ['has:attachment subject:"KEEPINTAX-DEV-UI-20261120-A1"']);
    expect(db.query.mock.calls[0][0]).toContain('r.business_number=imported_documents.business_number');
  });
  it('rejects direct execution outside the test run before leasing or Drive/AI access', async () => {
    const db = { query: jest.fn(async () => []), createQueryRunner: jest.fn() };
    const store = new EmailIntakeStore(db as any);
    const worker = new EmailProcessingWorker(store, {} as any, {} as any, {} as any);
    await expect(worker.runOne({ email_run_id: 'old-run', firebase_id: 'owner', business_number: 'business' } as any)).rejects.toThrow('outside DEV');
    expect(db.createQueryRunner).not.toHaveBeenCalled();
    await expect(worker.deleteOne({ email_run_id: 'old-run', firebase_id: 'owner', business_number: 'business' } as any, 'token', {} as any)).rejects.toThrow('outside DEV');
  });
  it('accepts only the owned test run and enforces the configured mailbox/business limits', async () => {
    const db = { query: jest.fn(async () => [{ integration_id: 17 }]) };
    process.env.GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS = '17';
    process.env.GMAIL_DURABLE_REQUIRED_BUSINESS_NUMBER = 'business';
    const store = new EmailIntakeStore(db as any);
    await store.assertDevWorkScope({ email_run_id: 'run', firebase_id: 'owner', business_number: 'business' } as any);
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['run', 'owner', 'business', 'has:attachment subject:"KEEPINTAX-DEV-UI-20261120-A1"']);
    process.env.GMAIL_DURABLE_ALLOWED_INTEGRATION_IDS = '18';
    await expect(store.assertDevWorkScope({ email_run_id: 'run', firebase_id: 'owner', business_number: 'business' } as any)).rejects.toThrow('scope');
  });

});
