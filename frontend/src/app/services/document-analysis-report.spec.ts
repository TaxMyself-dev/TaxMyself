import { signal } from '@angular/core';
import { of } from 'rxjs';
import { VatReportJournalPage } from '../pages/vat-report-journal/vat-report-journal.page';
import { PnLReportJournalPage } from '../pages/pnl-report-journal/pnl-report-journal.page';
describe('reports wait for queued document analysis',()=>{
  for(const page of [VatReportJournalPage,PnLReportJournalPage]){
    it(`${page.name} polls instead of reporting completion after queue registration`,()=>{
      const subject:any=Object.create(page.prototype);
      Object.assign(subject,{inboxProcessingBusinessNumber:'biz',destroyRef:{onDestroy:()=>()=>{}},driveDocsService:{processInbox:()=>of({queued:7,alreadyProcessing:false,failed:0})},pollInboxProcessing:jasmine.createSpy(),finishInboxProcessing:jasmine.createSpy(),inboxProcessingState:signal('processing'),inboxDocumentsPending:signal(7)});
      subject.runInboxProcessing('biz');expect(subject.pollInboxProcessing).toHaveBeenCalledWith('biz');expect(subject.finishInboxProcessing).not.toHaveBeenCalled();
    });
  }
});
