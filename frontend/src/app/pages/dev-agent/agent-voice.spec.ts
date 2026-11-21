import { fakeAsync, tick, flushMicrotasks } from '@angular/core/testing';
import { AgentVoice, VoiceEvents, VoiceOptions, VoiceSession } from './agent-voice';
import { signal } from '@angular/core';
import { DevAgentPage } from './dev-agent.page';

describe('voice message lifecycle', () => {
  let voice: AgentVoice;
  let events: VoiceEvents;
  let options: VoiceOptions;
  let complete: () => void;
  let session: VoiceSession;
  beforeEach(() => {
    session = { stop: jasmine.createSpy('stop').and.callFake(() => new Promise<void>(r => complete = r)), cancel: jasmine.createSpy('cancel') };
    voice = new AgentVoice(async (_options, e) => { events = e; return session; });
    options = { key: async () => 'temporary', locale: 'he', current: () => true, send: jasmine.createSpy('send') };
  });
  afterEach(() => voice.cancel());

  it('shows recording and starts the timer before the network connects', fakeAsync(() => {
    void voice.start(options); flushMicrotasks();
    events.captureStarted(); tick(1500);
    expect(voice.state()).toBe('recording'); expect(voice.seconds()).toBe(1);
    const finishing=voice.finish();
    expect(voice.state()).toBe('processing');
    events.connected();
    expect(voice.state()).toBe('processing');
    events.text('בדיקה קצרה'); complete(); flushMicrotasks();
    expect(options.send).toHaveBeenCalledOnceWith('בדיקה קצרה');
    void finishing;
  }));
  it('still bounds connection time when microphone capture has already started', fakeAsync(() => {
    void voice.start(options); flushMicrotasks(); events.captureStarted();
    tick(45_000);
    expect(voice.active).toBeFalse(); expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(options.send).not.toHaveBeenCalled();
  }));
  it('waits for the last words and sends a single message after repeated arrow clicks', async () => {
    await voice.start(options); events.captureStarted(); events.connected(); events.text('כמה ');
    const finishing = voice.finish(); void voice.finish();
    expect(options.send).not.toHaveBeenCalled(); expect(voice.state()).toBe('processing');
    events.text('הוצאתי השנה?'); complete(); await finishing;
    expect(options.send).toHaveBeenCalledOnceWith('כמה הוצאתי השנה?');
    expect(session.stop).toHaveBeenCalledTimes(1); expect(voice.active).toBeFalse();
  });
  it('discards finalization results after trash and permits a fresh recording', async () => {
    await voice.start(options); events.captureStarted(); events.connected(); events.text('ישן');
    const finishing = voice.finish(); const oldEvents=events;
    voice.cancel(); await voice.start(options); events.captureStarted(); events.connected(); events.text('חדש');
    oldEvents.text('מאוחר'); complete(); await finishing;
    expect(options.send).not.toHaveBeenCalled(); expect(voice.state()).toBe('recording');
  });
  it('closes a session that finishes starting after cancellation', async () => {
    let resolve!: (value: VoiceSession) => void;
    voice = new AgentVoice(() => new Promise<VoiceSession>(r => resolve = r));
    const pending=voice.start(options); voice.cancel(); resolve(session); await pending;
    expect(session.cancel).toHaveBeenCalledTimes(1); expect(options.send).not.toHaveBeenCalled();
  });
  it('does not send silence or failed partial transcripts', async () => {
    await voice.start(options); events.captureStarted(); events.connected(); events.text('  ');
    let pending=voice.finish(); complete(); await pending;
    expect(options.send).not.toHaveBeenCalled(); expect(voice.error()).toContain('לא זוהה');
    await voice.start(options); events.captureStarted(); events.connected(); events.text('חלקי');
    events.error(new Error('network')); await voice.finish();
    expect(options.send).not.toHaveBeenCalled(); expect(voice.error()).toContain('לא נשלחה');
  });
  it('cancels when the chat/client context changes, including during processing', async () => {
    let current=true; options.current=()=>current;
    await voice.start(options); events.captureStarted(); events.connected(); events.text('פרטי');
    const pending=voice.finish(); current=false; complete(); await pending;
    expect(options.send).not.toHaveBeenCalled(); expect(voice.active).toBeFalse();
  });
  it('explains exhausted balance without sending or exposing provider details', async () => {
    await voice.start(options); events.captureStarted(); events.connected(); events.text('חלקי');
    events.error(Object.assign(new Error('private provider details'), { name: 'QuotaError', code: 'quota_exceeded', statusCode: 402 }));
    await voice.finish();
    expect(voice.active).toBeFalse(); expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(options.send).not.toHaveBeenCalled(); expect(voice.error()).toContain('יתרת השימוש');
    expect(voice.error()).not.toContain('private');
  });
  it('distinguishes request limits from exhausted balance', async () => {
    await voice.start(options);
    events.error(Object.assign(new Error('quota'), { name: 'QuotaError', statusCode: 429 }));
    expect(voice.error()).toContain('מגבלת הבקשות'); expect(voice.active).toBeFalse();
    expect(options.send).not.toHaveBeenCalled();
  });
  it('handles denied permissions with a recoverable message', async () => {
    voice = new AgentVoice(async () => { throw new DOMException('denied','NotAllowedError'); });
    await voice.start(options);
    expect(voice.error()).toContain('הרשאה'); expect(voice.active).toBeFalse();
  });
  it('ends capture at two minutes and waits for finalization', fakeAsync(() => {
    void voice.start(options); flushMicrotasks(); events.captureStarted(); events.connected(); events.text('בדיקה');
    tick(120_000); expect(session.stop).toHaveBeenCalledTimes(1); expect(voice.state()).toBe('processing');
    complete(); flushMicrotasks(); expect(options.send).toHaveBeenCalledOnceWith('בדיקה');
  }));
  it('times out connection and finalization without sending partial text', fakeAsync(() => {
    void voice.start(options); flushMicrotasks(); tick(45_000);
    expect(voice.active).toBeFalse(); expect(session.cancel).toHaveBeenCalledTimes(1);
    void voice.start(options); flushMicrotasks(); events.captureStarted(); events.connected(); events.text('חלקי');
    void voice.finish(); tick(15_000); complete(); flushMicrotasks();
    expect(options.send).not.toHaveBeenCalled(); expect(voice.active).toBeFalse();
  }));
  it('refuses a second start while a recording is active', async () => {
    await voice.start(options); events.captureStarted(); events.connected(); events.text('אחד');
    await voice.start(options); const pending=voice.finish(); complete(); await pending;
    expect(options.send).toHaveBeenCalledOnceWith('אחד');
  });
});

describe('voice chat integration', () => {
  function page() {
    const p: any=Object.create(DevAgentPage.prototype);
    const sendMessage=jasmine.createSpy('sendMessage');
    const chat={id:'chat',status:'ready',sendMessage,stop:async()=>{}};
    let events!:VoiceEvents;
    const voice=new AgentVoice(async (_o,e)=> { events=e; return {stop:async()=>{e.text('כמה הוצאתי?');},cancel:()=>{}}; });
    Object.assign(p,{voice,chat:signal(chat),context:signal({agentUserId:'user',clientId:null}),
      auth:{token:async()=>null,clientId:()=>null},locale:signal('he'),loading:signal(null),draft:'טיוטה',scrollDown:()=>{}});
    return {p,chat,connect:()=>{events.captureStarted(); events.connected();}};
  }
  it('sends text through the existing chat without clearing a typed draft', async () => {
    const {p,chat,connect}=page(); await p.startVoice(); connect(); await p.voice.finish();
    expect(chat.sendMessage).toHaveBeenCalledOnceWith({text:'כמה הוצאתי?'}); expect(p.draft).toBe('טיוטה');
  });
  it('cancels recording when a stored conversation is opened or the page destroyed', async () => {
    const {p,connect}=page(); await p.startVoice(); connect();
    p.ngOnDestroy(); expect(p.voice.active).toBeFalse();
  });
  it('does not start while the agent is answering', async () => {
    const {p,chat}=page(); chat.status='streaming'; await p.startVoice(); expect(p.voice.active).toBeFalse();
  });
});
