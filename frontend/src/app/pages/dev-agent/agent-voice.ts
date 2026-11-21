import { signal } from '@angular/core';

export interface VoiceSession {
  stop(): Promise<void>;
  cancel(): void;
}
export interface VoiceOptions {
  key(): Promise<string>;
  locale: 'he' | 'en';
  current(): boolean;
  send(text: string): void;
}
export interface VoiceEvents {
  connected(): void;
  text(text: string): void;
  error(error: Error): void;
}
export type VoiceFactory = (options: VoiceOptions, events: VoiceEvents) => Promise<VoiceSession>;

// Loaded only when voice is used. The browser owns permission persistence;
// never store a fake permission flag or keep the microphone alive between uses.
export const createVoiceSession: VoiceFactory = async (options, events) => {
  const { SonioxClient } = await import('@soniox/client');
  if (!options.current()) throw new Error('Canceled');
  const client = new SonioxClient({ config: async () => {
    if (!options.current()) throw new Error('Canceled');
    const api_key = await options.key();
    if (!options.current()) throw new Error('Canceled');
    return { api_key };
  } });
  const recording = client.realtime.record({ model: 'stt-rt-v6', language_hints: [options.locale] });
  recording.on('connected', events.connected);
  recording.on('error', events.error);
  recording.on('result', result => {
    // Results contain new final tokens and revisable partials. Only commit final
    // tokens, once; the graceful stop delivers the last words before resolving.
    events.text(result.tokens.filter(t => t.is_final && !/^<[^>]+>$/.test(t.text)).map(t => t.text).join(''));
  });
  return { stop: () => recording.stop(), cancel: () => recording.cancel() };
};

interface Run {
  options: VoiceOptions;
  session?: VoiceSession;
  text: string;
  timer?: ReturnType<typeof setInterval>;
  deadline?: ReturnType<typeof setTimeout>;
}

/** One recording, bound to its starting chat. No audio or transcript is persisted here. */
export class AgentVoice {
  readonly state = signal<'idle' | 'connecting' | 'recording' | 'processing'>('idle');
  readonly seconds = signal(0);
  readonly error = signal<string | null>(null);
  private run?: Run;
  constructor(private readonly factory: VoiceFactory = createVoiceSession) {}

  get minutes() { return Math.floor(this.seconds() / 60); }

  get active() { return this.state() !== 'idle'; }

  async start(options: VoiceOptions) {
    if (this.active || !options.current()) return;
    this.error.set(null);
    this.seconds.set(0);
    this.state.set('connecting');
    const run: Run = { options, text: '' };
    this.run = run;
    run.deadline = setTimeout(() => this.fail(run, new Error('timeout')), 45_000);
    try {
      const session = await this.factory({ ...options, current: () => this.run === run && options.current() }, {
        connected: () => {
          if (!this.live(run)) return;
          clearTimeout(run.deadline);
          this.state.set('recording');
          const started = Date.now();
          run.timer = setInterval(() => {
            if (!this.live(run)) return;
            this.seconds.set(Math.floor((Date.now() - started) / 1000));
            if (this.seconds() >= 120) void this.finish();
          }, 250);
        },
        text: text => { if (this.live(run)) run.text += text; },
        error: error => this.fail(run, error),
      });
      if (!this.live(run)) { session.cancel(); return; }
      run.session = session;
    } catch (error) {
      this.fail(run, error);
    }
  }

  async finish() {
    const run = this.run;
    if (!run?.session || this.state() !== 'recording' || !this.live(run)) return;
    this.state.set('processing');
    clearInterval(run.timer);
    run.deadline = setTimeout(() => this.fail(run, new Error('timeout')), 15_000);
    try {
      await run.session.stop();
      if (!this.live(run)) return;
      const text = run.text.trim();
      this.cancel();
      if (text) run.options.send(text);
      else this.error.set('לא זוהה דיבור. אפשר להקליט שוב.');
    } catch (error) { this.fail(run, error); }
  }

  cancel() {
    const run = this.run;
    this.run = undefined;
    this.state.set('idle');
    if (!run) return;
    clearTimeout(run.deadline);
    clearInterval(run.timer);
    run.session?.cancel();
    run.text = '';
  }

  private live(run: Run) {
    if (this.run !== run) return false;
    if (!run.options.current()) { this.cancel(); return false; }
    return true;
  }

  private fail(run: Run, error: unknown) {
    if (!this.live(run)) return;
    const name = error instanceof Error ? error.name + ' ' + error.message : '';
    this.cancel();
    this.error.set(/NotAllowed|Permission|permission|denied/.test(name)
      ? 'אין הרשאה למיקרופון. אפשר לאפשר גישה בהגדרות האתר בדפדפן.'
      : /NotFound|NotReadable|AudioDevice/.test(name) ? 'המיקרופון אינו זמין. בדקו שהוא מחובר ואינו בשימוש.'
      : /AudioUnavailable/.test(name) ? 'הקלטה אינה זמינה בדפדפן זה. אפשר לכתוב הודעה או לנסות דפדפן אחר.'
      : 'ההקלטה לא נשלחה. בדקו את החיבור ונסו להקליט שוב.');
  }
}
