import { DevAgentPage } from './dev-agent.page';
import { signal } from '@angular/core';
import { classificationCard, classificationApprovalDecision } from './classification-card';
describe('classification approval card',()=>{
  const display={businessNumber:'123456789',businessName:'עסק',date:'2026-11-12',merchant:'Adobe',amount:-118,currency:'ILS',currentCategory:null,currentSubCategory:null,category:'משרד',subCategory:'תוכנה',vatPercent:100,taxPercent:100};
  const prepared={type:'tool-prepareTransactionClassification',state:'output-available',output:{proposalId:'id',display}};
  const action={type:'tool-classifyTransaction',input:{proposalId:'id'}};
  it('uses the original stored preparation on reload, ignoring labels in action input',()=>{
    expect(classificationCard(action,[{role:'assistant',parts:[prepared,action]}])).toEqual(display);
  });
  it('refuses an unrelated, missing, failed or user-supplied proposal',()=>{
    expect(classificationCard(action,[])).toBeNull();
    expect(classificationCard(action,[{role:'user',parts:[prepared]}])).toBeNull();
    const failed = {...prepared,state:'output-error'};
    expect(classificationCard(action,[{role:'assistant',parts:[failed]}])).toBeNull();
    expect(classificationCard({type:'tool-queryTransactions'},[])).toBeNull();
  });
});

describe('classification card mode approval',()=>{
  const card:any={modeChoice:true,isSingleUpdate:false};
  it('submits only the explicit rule/one-time selection with approval',()=>{
    expect(classificationApprovalDecision('id',true,card,false)).toEqual({id:'id',approved:true,reason:'classification-mode:rule'});
    expect(classificationApprovalDecision('id',true,card,true)).toEqual({id:'id',approved:true,reason:'classification-mode:one-time'});
  });
  it('denial never carries mode authorization and legacy cards keep their original mode',()=>{
    expect(classificationApprovalDecision('id',false,card,false)).toEqual({id:'id',approved:false});
    expect(classificationApprovalDecision('id',true,{} as any,false)).toEqual({id:'id',approved:true});
  });
});

describe('classification checkbox handler',()=>{
  it('starts unchecked for new cards and submits a changed selection on approval',()=>{
    const page:any=Object.create(DevAgentPage.prototype);
    const send=jasmine.createSpy('addToolApprovalResponse');
    Object.assign(page,{classificationModes:signal({}),chat:()=>({addToolApprovalResponse:send})});
    const card:any={modeChoice:true,isSingleUpdate:false};
    expect(page.classificationSingle('id',card)).toBeFalse();
    page.answerApproval('id',true,card);
    expect(send).toHaveBeenCalledWith({id:'id',approved:true,reason:'classification-mode:rule'});
    page.setClassificationSingle('id',true);
    expect(page.classificationSingle('id',card)).toBeTrue();
    page.answerApproval('id',true,card);
    expect(send).toHaveBeenCalledWith({id:'id',approved:true,reason:'classification-mode:one-time'});
    page.answerApproval('id',false,card);
    expect(send).toHaveBeenCalledWith({id:'id',approved:false});
    expect(page.classificationSingle('legacy',{})).toBeTrue();
  });
});
