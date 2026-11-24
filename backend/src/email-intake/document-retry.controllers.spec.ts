import { DocumentsController } from '../documents/documents.controller';
import { IntegrationsController } from '../integrations/integrations.controller';
import { ForbiddenException } from '@nestjs/common';
describe('retry endpoint owner boundaries', () => {
  const req = (actor = 'owner', extra: any = {}) =>
    ({
      user: { firebaseId: 'owner', actorFirebaseId: actor },
      ...extra,
    } as any);
  function setup() {
    const retry: any = {
      retryFiles: jest.fn().mockResolvedValue({ retried: 1 }),
      retryMailbox: jest.fn().mockResolvedValue({ retried: 1 }),
    };
    const docs = new DocumentsController({} as any, undefined, retry);
    const mail = Object.create(
      IntegrationsController.prototype,
    ) as IntegrationsController;
    (mail as any).documentRetry = retry;
    return { retry, docs, mail };
  }
  it('passes authenticated owner and exact file selection to the service', async () => {
    const f = setup();
    await f.docs.retryProcessing(req(), {
      businessNumber: 'b',
      fileIds: ['f'],
    });
    expect(f.retry.retryFiles).toHaveBeenCalledWith('owner', 'b', ['f']);
  });
  it.each([
    { actor: 'other', extra: {} },
    { actor: 'owner', extra: { isDelegatedAccess: true } },
    { actor: 'owner', extra: { isAdminImpersonation: true } },
  ])('rejects impersonation/delegation $extra', async ({ actor, extra }) => {
    const f = setup();
    await expect(
      f.docs.retryProcessing(req(actor, extra), {
        businessNumber: 'b',
        fileIds: ['f'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      f.mail.retryEmailProcessing(req(actor, extra), 17, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.retry.retryFiles).not.toHaveBeenCalled();
    expect(f.retry.retryMailbox).not.toHaveBeenCalled();
  });
  it('passes the clicked mailbox and cursor without accepting a body owner', async () => {
    const f = setup();
    await f.mail.retryEmailProcessing(req(), 17, { cursor: 100 });
    expect(f.retry.retryMailbox).toHaveBeenCalledWith('owner', 17, 100);
  });
});
