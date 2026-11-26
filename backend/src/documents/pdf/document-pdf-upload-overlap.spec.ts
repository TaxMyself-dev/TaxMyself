import { DocumentsService } from '../documents.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: any) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('signed PDF upload pipeline', () => {
  let service: any;
  const initialParallel = process.env.PDF_PARALLEL_SIGNING;
  const data = {docData:{issuerBusinessNumber:'synthetic',generalDocIndex:1,docType:'PRICE_QUOTE',docDescription:'test'}};
  beforeEach(() => {
    process.env.PDF_PARALLEL_SIGNING = 'false';
    service = Object.create(DocumentsService.prototype);
    service.preparePdfModel = jest.fn().mockResolvedValue({documentType:'מקור'});
    service.documentPdfRenderer = {render:jest.fn().mockResolvedValue(Buffer.from('%PDF-rendered'))};
    service.fillFasterSigner = {sign:jest.fn().mockResolvedValue(Buffer.from('%PDF-signed'))};
    service.uploadToFirebase = jest.fn(async (...args) => args[5]+'-path');
    service.deleteFromFirebase = jest.fn().mockResolvedValue(undefined);
  });
  afterEach(() => {
    if(initialParallel===undefined)delete process.env.PDF_PARALLEL_SIGNING;
    else process.env.PDF_PARALLEL_SIGNING=initialParallel;
  });
  it('uploads original while copy still renders and serial copy signing never waits for original upload', async () => {
    const renderCopy=deferred<Buffer>(),uploadOriginal=deferred<string>();
    const originalStarted=deferred<void>(),copyStarted=deferred<void>();
    service.documentPdfRenderer.render.mockResolvedValueOnce(Buffer.from('%PDF-original')).mockImplementationOnce(()=>renderCopy.promise);
    service.uploadToFirebase.mockImplementation(async (...args)=>{
      if(args[5]==='original'){originalStarted.resolve();return uploadOriginal.promise;}
      copyStarted.resolve();return 'copy-path';
    });
    const operation=service.generatePdfPair(data);
    await originalStarted.promise;
    expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(1);
    expect(service.uploadToFirebase).toHaveBeenCalledTimes(1);
    renderCopy.resolve(Buffer.from('%PDF-copy'));
    await copyStarted.promise;
    expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(2);
    uploadOriginal.resolve('original-path');
    await expect(operation).resolves.toEqual(expect.objectContaining({originalFilePath:'original-path',copyFilePath:'copy-path'}));
  });
  it('also uploads copy immediately if parallel copy signing finishes first', async () => {
    process.env.PDF_PARALLEL_SIGNING='true';
    const original=deferred<Buffer>(),copyUploadStarted=deferred<void>();
    service.fillFasterSigner.sign.mockImplementationOnce(()=>original.promise).mockResolvedValueOnce(Buffer.from('%PDF-copy'));
    service.uploadToFirebase.mockImplementation(async (...args)=>{if(args[5]==='copy')copyUploadStarted.resolve();return args[5]+'-path';});
    const operation=service.generatePdfPair(data);
    await copyUploadStarted.promise;
    expect(service.uploadToFirebase).toHaveBeenCalledTimes(1);
    expect(service.uploadToFirebase.mock.calls[0][5]).toBe('copy');
    original.resolve(Buffer.from('%PDF-original'));
    await expect(operation).resolves.toEqual(expect.objectContaining({originalFilePath:'original-path',copyFilePath:'copy-path'}));
  });
  it('drains an in-flight original upload and cleans it when copy rendering fails', async () => {
    const renderCopy=deferred<Buffer>(),uploadOriginal=deferred<string>(),started=deferred<void>();
    service.documentPdfRenderer.render.mockResolvedValueOnce(Buffer.from('%PDF-original')).mockImplementationOnce(()=>renderCopy.promise);
    service.uploadToFirebase.mockImplementationOnce(()=>{started.resolve();return uploadOriginal.promise;});
    const operation=service.generatePdfPair(data);let settled=false;void operation.catch(()=>{settled=true;});
    await started.promise;const failure=Error('copy render failed');renderCopy.reject(failure);
    await Promise.resolve();expect(settled).toBe(false);expect(service.deleteFromFirebase).not.toHaveBeenCalled();
    uploadOriginal.resolve('original-path');
    await expect(operation).rejects.toBe(failure);
    expect(service.deleteFromFirebase).toHaveBeenCalledTimes(1);
    expect(service.deleteFromFirebase).toHaveBeenCalledWith('original-path');
    expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(1);
  });
  it('drains and cleans copy upload if original signing fails after copy has started uploading', async () => {
    process.env.PDF_PARALLEL_SIGNING='true';
    const original=deferred<Buffer>(),copyUpload=deferred<string>(),started=deferred<void>();
    service.fillFasterSigner.sign.mockImplementationOnce(()=>original.promise).mockResolvedValueOnce(Buffer.from('%PDF-copy'));
    service.uploadToFirebase.mockImplementationOnce(()=>{started.resolve();return copyUpload.promise;});
    const operation=service.generatePdfPair(data);let settled=false;void operation.catch(()=>{settled=true;});
    await started.promise;const failure=Error('original sign failed');original.reject(failure);
    await Promise.resolve();expect(settled).toBe(false);
    copyUpload.resolve('copy-path');await expect(operation).rejects.toBe(failure);
    expect(service.deleteFromFirebase).toHaveBeenCalledWith('copy-path');
    expect(service.uploadToFirebase).toHaveBeenCalledTimes(1);
    expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(2);
  });
  it('handles an early upload rejection while copy work is pending, drains it and cleans its successful file', async () => {
    const renderCopy=deferred<Buffer>(),started=deferred<void>();const failure=Error('original upload failed');
    service.documentPdfRenderer.render.mockResolvedValueOnce(Buffer.from('%PDF-original')).mockImplementationOnce(()=>renderCopy.promise);
    service.uploadToFirebase.mockImplementation(async (...args)=>{if(args[5]==='original'){started.resolve();throw failure;}return 'copy-path';});
    const operation=service.generatePdfPair(data);let settled=false;void operation.catch(()=>{settled=true;});
    await started.promise;await Promise.resolve();expect(settled).toBe(false);
    renderCopy.resolve(Buffer.from('%PDF-copy'));await expect(operation).rejects.toBe(failure);
    expect(service.deleteFromFirebase).toHaveBeenCalledWith('copy-path');
    expect(service.uploadToFirebase).toHaveBeenCalledTimes(2);
  });
  it('preserves signing failure even if best-effort cleanup also fails', async () => {
    const failure=Error('copy sign failed');
    service.fillFasterSigner.sign.mockResolvedValueOnce(Buffer.from('%PDF-original')).mockRejectedValueOnce(failure);
    service.deleteFromFirebase.mockRejectedValue(Error('cleanup failed'));
    await expect(service.generatePdfPair(data)).rejects.toBe(failure);
    expect(service.deleteFromFirebase).toHaveBeenCalledWith('original-path');
  });
  it('does not upload or sign anything if original rendering fails', async () => {
    service.documentPdfRenderer.render.mockRejectedValueOnce(Error('render failed'));
    await expect(service.generatePdfPair(data)).rejects.toThrow('render failed');
    expect(service.fillFasterSigner.sign).not.toHaveBeenCalled();
    expect(service.uploadToFirebase).not.toHaveBeenCalled();
  });
});
