import { DocumentsService } from './documents.service';
import { DocumentStatusType, DocumentType } from '../enum';
describe('recipient email issuance transaction', () => {
  let service: any;
  let runner: any;
  let payload: any;
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const repo = { save: jest.fn(async (row) => row), update: jest.fn() };
    runner = {
      manager: { getRepository: () => repo },
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
    };
    service = Object.create(DocumentsService.prototype);
    service.dataSource = { createQueryRunner: () => runner };
    service.incrementGeneralIndex = jest
      .fn()
      .mockResolvedValue({ currentIndex: 100 });
    service.incrementCurrentIndex = jest
      .fn()
      .mockResolvedValue({ currentIndex: 20 });
    service.deleteDraft = jest.fn();
    service.saveDocInfo = jest.fn().mockResolvedValue({ id: 99 });
    service.saveLinesInfo = jest.fn();
    service.savePaymentsInfo = jest.fn();
    service.generatePdfPair = jest
      .fn()
      .mockResolvedValue({
        original: Buffer.from('signed-original'),
        copy: Buffer.from('signed-copy'),
      });
    service.uploadPdfPair = jest
      .fn()
      .mockResolvedValue(['original-path', 'copy-path']);
    service.deleteFromFirebase = jest.fn();
    service.businessService = {
      getBusinessByNumber: jest
        .fn()
        .mockResolvedValue({ businessName: 'Business' }),
    };
    service.documentEmailQueue = {
      enabled: () => true,
      enqueue: jest.fn().mockResolvedValue(7),
      kick: jest.fn(),
    };
    service.mailService = { sendMailWithAttachment: jest.fn() };
    service.downloadFromFirebase = jest.fn();
    payload = {
      docData: {
        issuerBusinessNumber: 'test',
        docType: DocumentType.PRICE_QUOTE,
        recipientName: 'Customer',
        recipientEmail: 'customer@example.test',
        sendEmailToRecipient: true,
      },
      linesData: [],
      paymentData: [],
    };
  });
  afterEach(() => jest.restoreAllMocks());
  it('persists email in the document transaction and dispatches only after commit', async () => {
    runner.commitTransaction.mockImplementation(() => {
      expect(service.documentEmailQueue.enqueue).toHaveBeenCalledWith(
        runner.manager,
        99,
        expect.objectContaining({
          to: 'customer@example.test',
          filePath: 'original-path',
        }),
      );
      expect(service.documentEmailQueue.kick).not.toHaveBeenCalled();
    });
    const result = await service.createDoc(payload, 'owner');
    expect(result.emailStatus).toBe('QUEUED');
    expect(service.documentEmailQueue.kick).toHaveBeenCalledWith(
      7,
      Buffer.from('signed-original'),
    );
    expect(service.mailService.sendMailWithAttachment).not.toHaveBeenCalled();
    expect(service.downloadFromFirebase).not.toHaveBeenCalled();
  });
  it.each(['not-selected', 'no-recipient', 'pending-allocation'])(
    'does not queue/send when %s',
    async (reason) => {
      if (reason === 'not-selected')
        payload.docData.sendEmailToRecipient = false;
      if (reason === 'no-recipient') payload.docData.recipientEmail = null;
      if (reason === 'pending-allocation')
        payload.docData.docStatus = DocumentStatusType.PENDING_ALLOCATION;
      await service.createDoc(payload, 'owner');
      expect(service.documentEmailQueue.enqueue).not.toHaveBeenCalled();
      expect(service.documentEmailQueue.kick).not.toHaveBeenCalled();
    },
  );
  it('never dispatches when commit fails', async () => {
    runner.commitTransaction.mockRejectedValue(Error('commit failed'));
    await expect(service.createDoc(payload, 'owner')).rejects.toThrow(
      'commit failed',
    );
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(service.documentEmailQueue.kick).not.toHaveBeenCalled();
  });
  it('rolls back and cleans files if atomic enqueue fails', async () => {
    service.documentEmailQueue.enqueue.mockRejectedValue(
      Error('outbox unavailable'),
    );
    await expect(service.createDoc(payload, 'owner')).rejects.toThrow(
      'outbox unavailable',
    );
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(service.deleteFromFirebase).toHaveBeenCalledTimes(2);
    expect(service.documentEmailQueue.kick).not.toHaveBeenCalled();
  });
  it('reuses signed original in compatibility mode without a storage roundtrip', async () => {
    service.documentEmailQueue.enabled = () => false;
    await service.createDoc(payload, 'owner');
    expect(service.mailService.sendMailWithAttachment).toHaveBeenCalledWith(
      'customer@example.test',
      expect.any(String),
      expect.any(String),
      Buffer.from('signed-original'),
      expect.any(String),
    );
    expect(service.downloadFromFirebase).not.toHaveBeenCalled();
  });
  it('preserves best-effort email behavior when compatibility delivery fails', async () => {
    service.documentEmailQueue.enabled = () => false;
    service.mailService.sendMailWithAttachment.mockRejectedValue(
      Error('mail down'),
    );
    await expect(service.createDoc(payload, 'owner')).resolves.toEqual(
      expect.objectContaining({ success: true }),
    );
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
