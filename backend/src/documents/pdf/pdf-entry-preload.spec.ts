import { DocumentsService } from '../documents.service';
import { DocumentPdfRenderer } from './document-pdf-renderer.service';
import { DocumentPdfClient } from './document-pdf-client';
import axios from 'axios';
jest.mock('axios');

describe('advisory PDF entry preload', () => {
  let service: any;
  beforeEach(() => {
    service = Object.create(DocumentsService.prototype);
    service.pendingPdfPreloads = new Map();
    service.businessService = {getBusinessByNumber: jest.fn().mockResolvedValue({logoPath:'owned-logo'})};
    service.documentPdfRenderer = {warmup:jest.fn().mockResolvedValue(undefined)};
    service.imageStorage = {download:jest.fn().mockResolvedValue({buffer:Buffer.from('logo')})};
  });
  it('authorizes issuer ownership before warming/downloading', async () => {
    service.businessService.getBusinessByNumber.mockResolvedValue(null);
    await expect(service.preloadPdf('business','caller')).rejects.toThrow();
    expect(service.documentPdfRenderer.warmup).not.toHaveBeenCalled();
    expect(service.imageStorage.download).not.toHaveBeenCalled();
  });
  it('starts both independent operations and deduplicates only in-flight owned work', async () => {
    let finish:()=>void;
    service.documentPdfRenderer.warmup.mockReturnValue(new Promise<void>(r=>finish=r));
    const a=service.preloadPdf('business','caller'),b=service.preloadPdf('business','caller');
    await Promise.resolve();await Promise.resolve();
    expect(service.imageStorage.download).toHaveBeenCalledWith('owned-logo','pdf');
    expect(service.documentPdfRenderer.warmup).toHaveBeenCalledTimes(1);
    expect(service.businessService.getBusinessByNumber).toHaveBeenCalledTimes(2);
    finish();await Promise.all([a,b]);expect(service.pendingPdfPreloads.size).toBe(0);
  });
  it('tolerates storage/render failure without issuance or signing', async () => {
    service.documentPdfRenderer.warmup.mockRejectedValue(Error('offline'));
    service.imageStorage.download.mockRejectedValue(Error('offline'));
    await expect(service.preloadPdf('business','caller')).resolves.toBeUndefined();
    expect(service.pendingPdfPreloads.size).toBe(0);
  });
  it('uses latest logo on each entry and skips missing logo', async () => {
    service.businessService.getBusinessByNumber.mockResolvedValueOnce({logoPath:null}).mockResolvedValueOnce({logoPath:'new-logo'});
    await service.preloadPdf('business','caller');expect(service.imageStorage.download).not.toHaveBeenCalled();
    await service.preloadPdf('business','caller');expect(service.imageStorage.download).toHaveBeenCalledWith('new-logo','pdf');
  });
});

describe('renderer entry readiness', () => {
  const savedUrl=process.env.PDF_SERVICE_URL;
  afterEach(()=>{if(savedUrl===undefined)delete process.env.PDF_SERVICE_URL;else process.env.PDF_SERVICE_URL=savedUrl;jest.restoreAllMocks();});
  it('coalesces readiness and briefly suppresses redundant probes, retries failed probes', async () => {
    process.env.PDF_SERVICE_URL='http://127.0.0.1:8082';
    const remote={warmup:jest.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue(undefined)};
    const renderer=new DocumentPdfRenderer(remote as any);
    await expect(renderer.warmup()).rejects.toThrow('offline');
    await Promise.all([renderer.warmup(),renderer.warmup()]);await renderer.warmup();
    expect(remote.warmup).toHaveBeenCalledTimes(2);
    const clock=jest.spyOn(Date,'now').mockReturnValue(Date.now()+61000);await renderer.warmup();
    expect(remote.warmup).toHaveBeenCalledTimes(3);clock.mockRestore();
  });
  it('loopback probes readiness without rendering or sending a document', async () => {
    process.env.PDF_SERVICE_URL='http://127.0.0.1:8082';
    (axios.get as jest.Mock).mockResolvedValue({status:200,data:'ok'});
    await new DocumentPdfClient().warmup();
    expect(axios.get).toHaveBeenCalledWith('http://127.0.0.1:8082/healthz',expect.objectContaining({maxRedirects:0,timeout:60000}));
    expect(axios.post).not.toHaveBeenCalled();
  });
  it('uses service IAM for HTTPS probes and never sends user authorization', async () => {
    process.env.PDF_SERVICE_URL='https://pdf.example.test';
    const client=new DocumentPdfClient();
    jest.spyOn(client as any,'identityHeaders').mockResolvedValue(new Map([['authorization','Bearer service-identity']]));
    (axios.get as jest.Mock).mockResolvedValue({status:200,data:'ok'});
    await client.warmup();
    expect(axios.get).toHaveBeenCalledWith('https://pdf.example.test/healthz',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer service-identity'})}));
  });
  it('rejects invalid warmup destinations', async () => {
    process.env.PDF_SERVICE_URL='http://external.test';
    await expect(new DocumentPdfClient().warmup()).rejects.toThrow('invalid');
  });
});
