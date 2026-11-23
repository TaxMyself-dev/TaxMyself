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
    Object.assign(page,{classificationModes:signal({}),context:signal(null),setupError:signal(null),chat:()=>({addToolApprovalResponse:send})});
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

describe('stale card action guard and fresh request',()=>{
  it('does not submit an approval for an older message even if its handler is invoked',()=>{
    const page:any=Object.create(DevAgentPage.prototype);
    const send=jasmine.createSpy('addToolApprovalResponse');
    const chat:any={status:'ready',messages:[{id:'old',role:'assistant',parts:[{type:'tool-classifyTransaction',state:'approval-requested',approval:{id:'a'}}]},{id:'new',role:'assistant',parts:[{type:'text',text:'שני שמות'}]}],addToolApprovalResponse:send};
    Object.assign(page,{context:signal(null),setupError:signal(null),chat:()=>chat});
    page.answerApproval('a',true,null,'old');
    expect(send).not.toHaveBeenCalled();
    expect(page.setupError()).toContain('כבר אינו פעיל');
    chat.messages=[chat.messages[0]];
    page.answerApproval('a',false,null,'old');
    expect(send).toHaveBeenCalledOnceWith({id:'a',approved:false});
    expect(page.setupError()).toBeNull();
  });
  it('requests a new proposal rather than turning a typed message into approval',()=>{
    const page:any=Object.create(DevAgentPage.prototype);
    page.send=jasmine.createSpy('send');
    page.setupError=signal('old error');
    page.requestFreshClassification({businessNumber:'123456789',merchant:'ליברה ביטוח חובה',date:'2026-06-11',amount:-143.58,currency:'ILS',category:'רכב',subCategory:'ביטוח'},true);
    const text=page.send.calls.mostRecent().args[0];
    expect(text).toContain('כרטיס אישור חדש ועדכני');
    expect(text).toContain('ליברה ביטוח חובה');
    expect(text).toContain('באופן חד פעמי');
    expect(text).toContain('אל תבצע שינוי בלי אישור חדש');
  });
});
