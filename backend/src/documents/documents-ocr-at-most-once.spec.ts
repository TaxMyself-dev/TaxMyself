import { DocumentsService } from './documents.service';
import { BadRequestException } from '@nestjs/common';
import { ExtractedDocStatus } from './extracted-document.entity';
describe('document entry points preserve the shared at-most-once boundary',()=>{
  function subject(){return {queueBufferAnalysis:jest.fn().mockResolvedValue({queued:true,jobId:'job',state:'READY'}),documentProcessor:{extract:jest.fn()}};}
  it('requires an explicit transaction before any upload or analysis',async()=>{const t=subject();await expect(DocumentsService.prototype.uploadAndOcrDoc.call(t as any,'owner','biz',Buffer.from('synthetic'),'test.pdf','application/pdf')).rejects.toBeInstanceOf(BadRequestException);expect(t.queueBufferAnalysis).not.toHaveBeenCalled();});
  it('queues transaction identity and actor without a synchronous provider call',async()=>{const t=subject();const bytes=Buffer.from('synthetic');await expect(DocumentsService.prototype.uploadAndOcrDoc.call(t as any,'owner','biz',bytes,'test.pdf','application/pdf',17,'actor')).resolves.toMatchObject({queued:true});expect(t.queueBufferAnalysis).toHaveBeenCalledWith('owner','biz',bytes,'test.pdf','application/pdf','TRANSACTION_LINK',{transactionId:17},'actor');expect(t.documentProcessor.extract).not.toHaveBeenCalled();});
  it('never falls back to direct AI when durable admission fails',async()=>{const t=subject();t.queueBufferAnalysis.mockRejectedValue(new Error('queue unavailable'));await expect(DocumentsService.prototype.uploadAndOcrDoc.call(t as any,'owner','biz',Buffer.from('synthetic'),'test.pdf','application/pdf',17)).rejects.toThrow('queue unavailable');expect(t.documentProcessor.extract).not.toHaveBeenCalled();});
  it('persists multi-invoice results by updating the durable claim, not replacing it',async()=>{
    const claim:any={id:7},sibling:any={id:8,subIndex:1};const repository={create:jest.fn(v=>v),save:jest.fn()};
    const t:any={normalizeDocumentType:v=>v,normalizeCurrency:v=>v,deriveMonthFromExtraction:()=> '2026-11',normalizeAllocationNumber:v=>v,matchCatalogSubCategoryId:()=>null,fxRateService:{getRate:jest.fn()}};
    await (DocumentsService.prototype as any).persistExtractedRows.call(t,{index:1},'biz',{id:'file',name:'synthetic.pdf'},new Date(),'DRIVE',claim,[{document_type:'invoice',currency:'ILS',amount:10},{document_type:'receipt',currency:'ILS',amount:20}],'saved result',[],repository,[claim,sibling]);
    const rows=repository.save.mock.calls[0][0];expect(rows).toHaveLength(2);expect(rows[0]).toBe(claim);expect(rows[1]).toBe(sibling);expect(rows[0]).toMatchObject({id:7,subIndex:0,status:ExtractedDocStatus.PENDING_REVIEW});expect(repository.create).not.toHaveBeenCalled();
  });
});
