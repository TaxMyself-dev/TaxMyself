import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { DevAgentPage } from './dev-agent.page';

describe('chat startup', () => {
  function page() {
    const p: any = Object.create(DevAgentPage.prototype);
    Object.assign(p, {loading: signal(null), loadGeneration: 0, chat: signal(null),
      context: signal({agentUserId:'owner',clientId:null}), setupError:signal(null),
      auth:{token:async()=>null,clientId:()=>null},apiUrl:'http://127.0.0.1:3001/', draft:'draft'});
    return p;
  }
  function deferredRead() {
    let resolve!: (response: Response) => void;
    spyOn(window,'fetch').and.returnValue(new Promise<Response>(r=>resolve=r));
    return () => resolve(new Response(JSON.stringify(JSON.stringify([{id:'m',role:'user',parts:[{type:'text',text:'old'}]}]))));
  }
  it('renders an editable composer before the session resolves and cannot send', async () => {
    TestBed.configureTestingModule({imports:[DevAgentPage],providers:[
      {provide:AngularFireAuth,useValue:{authState:of(null)}},
      {provide:ClientPanelService,useValue:{getSelectedClientId:()=>null,selectedClientId$:of(null)}},
      {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({})}}},
      {provide:Router,useValue:{navigate:()=>Promise.resolve(true)}}]});
    TestBed.overrideComponent(DevAgentPage, {add:{providers:[{provide:AngularFireAuth,useValue:{authState:of(null)}},{provide:ClientPanelService,useValue:{getSelectedClientId:()=>null,selectedClientId$:of(null)}}]}});
    TestBed.overrideProvider(ClientPanelService, {useValue:{getSelectedClientId:()=>null,selectedClientId$:of(null)}});
    const fixture=TestBed.createComponent(DevAgentPage);
    spyOn(fixture.componentInstance,'startSession').and.returnValue(new Promise<void>(()=>{}));
    fixture.detectChanges();
    const textarea=fixture.nativeElement.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea.disabled).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain('מתחבר');
    textarea.value='draft'; textarea.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.componentInstance.send();
    expect(fixture.componentInstance.draft).toBe('draft');
    expect(fixture.nativeElement.querySelector('.composer button').disabled).toBeTrue();
    const voice=fixture.componentInstance.voice;
    voice.state.set('recording'); voice.seconds.set(65); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.querySelector('.voice-time').textContent).toBe('1:05');
    expect(fixture.nativeElement.querySelector('.voice-send .pi-arrow-up')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.voice-discard .pi-trash')).not.toBeNull();
    fixture.nativeElement.querySelector('.voice-discard').click(); fixture.detectChanges();
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('draft');
    fixture.destroy();
  });
  it('waits for history, keeps the draft and resumes only after loading', async () => {
    const finish=deferredRead(); const p=page();
    const resume=jasmine.createSpy('resume');
    const start=spyOn(p,'startChat').and.returnValue({resumeStream:resume});
    const pending=p.openChat('stored');
    expect(p.loading()).toBe('history'); expect(start).not.toHaveBeenCalled();
    p.send(); expect(p.draft).toBe('draft');
    finish(); await pending;
    expect(start).toHaveBeenCalledWith(p.context(),'stored',jasmine.arrayContaining([jasmine.objectContaining({id:'m'})]));
    expect(resume).toHaveBeenCalledTimes(1); expect(p.draft).toBe('draft');
  });
  it('does not replace a new chat with an older history response', async () => {
    const finish=deferredRead(); const p=page();
    const start=spyOn(p,'startChat').and.returnValue({resumeStream:jasmine.createSpy()});
    const pending=p.openChat('old'); p.newChat();
    finish(); await pending;
    expect(start).toHaveBeenCalledTimes(1);
    expect(start.calls.first().args[1]).not.toBe('old');
  });
  it('discards history after the client changes or the page is destroyed', async () => {
    const finish=deferredRead(); const p=page();
    const start=spyOn(p,'startChat');
    const pending=p.openChat('old'); p.auth.clientId=()=> 'other'; p.ngOnDestroy();
    finish(); await pending;
    expect(start).not.toHaveBeenCalled(); expect(p.setupError()).toBeNull();
  });
});
