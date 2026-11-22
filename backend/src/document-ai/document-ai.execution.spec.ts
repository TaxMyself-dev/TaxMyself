import {
  documentExecution,
  documentTransportOptions,
} from './document-ai.execution';
import { AnthropicDocumentProvider } from './anthropic-document.provider';
import { DocumentProcessorService } from '../documents/document-processor.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
describe('request-scoped transport cancellation (offline)', () => {
  it('does not apply a round signal to unrelated calls', async () => {
    const controller = new AbortController();
    await documentExecution.run(controller.signal, async () => {
      expect(documentTransportOptions()).toMatchObject({
        signal: controller.signal,
        retry: false,
        timeout: 30000,
      });
    });
    expect(documentTransportOptions()).toEqual({});
    controller.abort();
    expect(() =>
      documentExecution.run(controller.signal, () =>
        documentTransportOptions(),
      ),
    ).toThrow('CANCELLED');
  });
  it('passes the round signal into the bounded provider adapter', async () => {
    const extract = jest.fn().mockResolvedValue({ invoices: [] });
    const controller = new AbortController();
    await documentExecution.run(controller.signal, () =>
      new AnthropicDocumentProvider({ extract } as any).analyze(
        {} as any,
        'claude-frozen',
      ),
    );
    expect(extract.mock.calls[0][4]).toMatchObject({
      signal: controller.signal,
      bounded: true,
    });
  });
  it('forwards cancellation and zero retries to the actual SDK request boundary', async () => {
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: '{"invoices":[]}' }],
    });
    const processor = new DocumentProcessorService({
      inspect: async () => ({ kind: 'readable', pages: 1 }),
    } as any);
    (processor as any).client = { messages: { create } };
    const controller = new AbortController();
    await processor.extract(
      Buffer.from('synthetic'),
      'application/pdf',
      [],
      false,
      { model: 'claude-frozen', bounded: true, signal: controller.signal },
    );
    expect(create.mock.calls[0][1]).toEqual({
      timeout: 45000,
      maxRetries: 0,
      signal: controller.signal,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('passes the signal to metadata, download and move on the system Drive identity', async () => {
    const get = jest.fn().mockResolvedValue({ data: Buffer.from('fixture') }),
      update = jest.fn().mockResolvedValue({});
    const drive = new GoogleDriveService();
    (drive as any).getSystemDrive = () => ({ files: { get, update } });
    const controller = new AbortController();
    await documentExecution.run(controller.signal, async () => {
      await drive.getIntakeFileMetadata('synthetic');
      await drive.downloadFile('synthetic');
      await drive.moveFile('synthetic', 'inbox', 'processed');
    });
    for (const call of [...get.mock.calls, ...update.mock.calls])
      expect(call[1]).toMatchObject({
        signal: controller.signal,
        retry: false,
        timeout: 30000,
      });
  });
  it('prevents a fallback Drive request after cancellation', async () => {
    const controller = new AbortController(),
      get = jest.fn(async () => {
        controller.abort();
        throw new Error('abort');
      }),
      fallback = jest.fn();
    const drive = new GoogleDriveService();
    (drive as any).getSystemDrive = () => ({ files: { get } });
    (drive as any).getDrive = () => ({ drive: { files: { get: fallback } } });
    await expect(
      documentExecution.run(controller.signal, () =>
        drive.downloadFile('synthetic'),
      ),
    ).rejects.toThrow();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('propagates cancellation to maintenance folder lookup, tagged upload search and exact-file delete', async () => {
    const controller = new AbortController(),
      list = jest.fn().mockResolvedValue({ data: { files: [{ id: 'temp' }] } }),
      remove = jest.fn().mockResolvedValue({});
    const drive = new GoogleDriveService();
    (drive as any).getDrive = () => ({ drive: { files: { list } } });
    (drive as any).getSystemDrive = () => ({ files: { list, delete: remove } });
    await documentExecution.run(controller.signal, async () => {
      await drive.ensureAnalysisTemporary('business');
      await drive.findProtectedUploads(
        'temp',
        '00000000-0000-0000-0000-000000000000',
      );
      await drive.deleteIntakeFile('fixture');
    });
    for (const call of [...list.mock.calls, ...remove.mock.calls])
      expect(call[1]).toMatchObject({
        signal: controller.signal,
        retry: false,
      });
    controller.abort();
    await expect(
      documentExecution.run(controller.signal, () =>
        drive.deleteIntakeFile('fixture'),
      ),
    ).rejects.toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
