import { GmailSyncService } from './gmail-sync.service';
import { GmailReaderService } from './gmail-reader.service';
import { GmailDriveImportService } from './gmail-drive-import.service';
import { EmailIntakeRunsService } from '../../email-intake/email-intake-runs.service';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';

describe('Outlook shared intake routing', () => {
  const row = { id: 2, firebaseId: 'owner', provider: IntegrationProvider.MICROSOFT, status: IntegrationStatus.ACTIVE, connectionBackend: 'COMPOSIO', connectedAccountId: 'ca-ms', initialImportCompletedAt: new Date('2026-01-01') } as any;
  it('includes Microsoft in status without changing per-account state', async () => {
    const integrations = { findAllVisibleByUserAndProvider: jest.fn(async (_owner, provider) => provider === IntegrationProvider.MICROSOFT ? [row] : []) };
    const service = new GmailSyncService(integrations as any, {} as any);
    const status = await service.getSyncStatus('owner');
    expect(status.accounts).toHaveLength(1);
    expect(status.accounts[0]).toMatchObject({ id: 2, provider: 'MICROSOFT', connected: true });
  });
  it('selects the Outlook reader using the persisted integration', async () => {
    const provider = { listMessages: jest.fn().mockResolvedValue({ids:[]}) };
    const reader = new GmailReaderService({} as any, provider as any);
    await reader.durablePage(row, 'has:attachment after:1767225600');
    expect(provider.listMessages).toHaveBeenCalledWith(expect.objectContaining({toolkit:'outlook',connectedAccountId:'ca-ms'}),expect.any(String),50,undefined);
  });
  it('allows a completed Outlook account in a selected-account manual pull', async () => {
    const integrations = { findAllActiveByUserAndProvider: jest.fn(async (_owner, provider) => provider === IntegrationProvider.MICROSOFT ? [row] : []), markSyncRunning: jest.fn(), finishManualSync: jest.fn() };
    const importer = new GmailDriveImportService({} as any, {} as any, integrations as any);
    jest.spyOn(importer,'importFromGmail').mockResolvedValue({imported:1,alreadyImported:0,skipped:0,attachmentsFound:1,messagesFound:1,messagesFailed:0} as any);
    expect((await importer.importAllForUser('owner',[2],{})).totalImported).toBe(1);
  });
  it('creates a durable Outlook run with a frozen date query', async () => {
    const store = { enabled:()=>true,createRun:jest.fn().mockResolvedValue('run-ms') };
    const integrations = { findOwnedByIdOrThrow:jest.fn().mockResolvedValue(row) };
    const importer = { resolveEmailBusiness:jest.fn().mockResolvedValue('business') };
    const service = new EmailIntakeRunsService(store as any,{} as any,integrations as any,importer as any,{} as any);
    expect(await service.startManual('owner',[2],{query:'has:attachment after:1767225600 before:1767312000'})).toEqual({started:true,runIds:['run-ms']});
    expect(store.createRun).toHaveBeenCalledWith(expect.objectContaining({integrationId:2,query:'has:attachment after:1767225600 before:1767312000'}));
  });
});
