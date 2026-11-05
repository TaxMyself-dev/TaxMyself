import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import type { Chat } from '@ai-sdk/angular';
import type { UIMessage } from 'ai';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { AuthService } from 'src/app/services/auth.service';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { environment } from 'src/environments/environment';
import {
  createDevAgentChat,
  DevAgentChatContext,
  devAgentHeaders,
  DevAgentRequestAuth,
  fixedContextAuth,
} from './dev-agent-chat';

type MessagePart = UIMessage['parts'][number];

// A tool part as the stream builds it (type `tool-<name>`), read loosely: the
// page shows every tool, whatever its input and output.
interface ToolPartView {
  name: string;
  state: string;
  input: unknown;
  output: unknown;
  errorText: string | null;
  approvalId: string | null;
}

// Only a local backend may stand in for the app's: the page sends it the
// signed-in user's Firebase token.
const devAgentApiUrl = (override: string | null) => {
  if (override && /^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}\/?$/.test(override)) {
    return override.endsWith('/') ? override : `${override}/`;
  }

  return environment.apiUrl;
};

const examplePrompts = [
  'כמה הוצאתי על דלק השנה?',
  'כמה אני מוציא על פלאפון?',
  'על מה הוצאתי הכי הרבה השנה?',
  'תראה לי את ההוצאות של החודש האחרון לפי ספק',
];

/**
 * A dev-only page to try the AI agent (backend/agent) against the real
 * backend: a chat that streams the agent's answers and shows everything it
 * does — each tool call with its input and output, approval cards to approve
 * or deny, reasoning summaries and the stream's data parts. It is a test
 * screen, not the product's chat (its UI spec is pending); the route exists
 * only when environment.agentDevPage is on (app-routing.module.ts).
 */
@Component({
  selector: 'app-dev-agent',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dev-agent.page.html',
  styleUrls: ['./dev-agent.page.scss'],
})
export class DevAgentPage implements OnInit, OnDestroy {
  private readonly afAuth = inject(AngularFireAuth);
  private readonly authService = inject(AuthService);
  private readonly clientPanelService = inject(ClientPanelService);

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  readonly examplePrompts = examplePrompts;
  // The backend the agent runs in: the app's, or another local one given as
  // ?api=http://localhost:3001/ (several worktrees' backends run side by side).
  readonly apiUrl = devAgentApiUrl(new URLSearchParams(location.search).get('api'));

  chat = signal<Chat<UIMessage> | null>(null);
  // The context the chat belongs to (agent user, business, client), read
  // once per session: a chat never moves to another client or business.
  context = signal<DevAgentChatContext | null>(null);
  setupError = signal<string | null>(null);
  locale = signal<'he' | 'en'>('he');
  draft = '';

  private readonly auth: DevAgentRequestAuth = {
    token: async () => await firstValueFrom(this.afAuth.idToken.pipe(take(1))),
    businessNumber: () => this.authService.getActiveBusinessNumber(),
    clientId: () => this.clientPanelService.getSelectedClientId(),
  };

  agentUserId() {
    return this.context()?.agentUserId ?? null;
  }

  // The business and client the chat belongs to.
  get businessNumber() {
    return this.context()?.businessNumber ?? null;
  }

  get clientId() {
    return this.context()?.clientId ?? null;
  }

  // Whether the app switched client or business since the chat's context
  // was read: the chat is then locked, and a new one starts in the new
  // context (startSession), so nothing from the previous client or business
  // is used under the new one.
  get contextChanged() {
    const context = this.context();

    return (
      context !== null &&
      (context.businessNumber !== this.auth.businessNumber() || context.clientId !== this.auth.clientId())
    );
  }

  async ngOnInit() {
    await this.startSession();
  }

  // Reads the agent's user for the app's current client and business, and
  // starts a chat in that context.
  async startSession() {
    void this.chat()?.stop();
    this.chat.set(null);
    this.context.set(null);
    this.setupError.set(null);

    const live = { businessNumber: this.auth.businessNumber(), clientId: this.auth.clientId() };

    try {
      const response = await fetch(`${this.apiUrl}api/agent/fn/readAgentSession`, {
        headers: await devAgentHeaders(fixedContextAuth(this.auth, live)),
      });
      const body = await response.json();

      if (!response.ok || typeof body?.userId !== 'string') {
        throw new Error(`${response.status}: ${JSON.stringify(body)}`);
      }

      this.context.set({ agentUserId: body.userId, ...live });
      this.newChat();
    } catch (error) {
      this.setupError.set(
        `The agent did not answer readAgentSession (${error instanceof Error ? error.message : String(error)}). ` +
          'Is the backend running with the agent built (npm run build in backend/agent) and its tables applied?',
      );
    }
  }

  ngOnDestroy() {
    void this.chat()?.stop();
  }

  newChat() {
    const context = this.context();

    if (!context) {
      return;
    }

    if (this.contextChanged) {
      void this.startSession();
      return;
    }

    void this.chat()?.stop();
    this.chat.set(
      createDevAgentChat({
        apiUrl: this.apiUrl,
        conversationId: crypto.randomUUID(),
        agentUserId: context.agentUserId,
        locale: this.locale(),
        auth: fixedContextAuth(this.auth, context),
        onFinish: () => this.scrollDown(),
        onError: () => this.scrollDown(),
      }),
    );
  }

  setLocale(locale: 'he' | 'en') {
    this.locale.set(locale);
    this.newChat();
  }

  send(text = this.draft) {
    const chat = this.chat();
    const message = text.trim();

    if (!chat || !message || this.isBusy(chat) || this.contextChanged) {
      return;
    }

    this.draft = '';
    void chat.sendMessage({ text: message });
    this.scrollDown();
  }

  onComposerKey(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  stop() {
    void this.chat()?.stop();
  }

  answerApproval(approvalId: string, approved: boolean) {
    void this.chat()?.addToolApprovalResponse({ id: approvalId, approved });
  }

  isBusy(chat: Chat<UIMessage>) {
    return chat.status === 'submitted' || chat.status === 'streaming';
  }

  isTool(part: MessagePart) {
    return part.type.startsWith('tool-') || part.type === 'dynamic-tool';
  }

  toolView(part: MessagePart): ToolPartView {
    const tool = part as unknown as {
      type: string;
      toolName?: string;
      state: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
      approval?: { id: string };
    };

    return {
      name: tool.toolName ?? tool.type.replace(/^tool-/, ''),
      state: tool.state,
      input: tool.input,
      output: tool.output,
      errorText: tool.errorText ?? null,
      approvalId: tool.state === 'approval-requested' ? tool.approval?.id ?? null : null,
    };
  }

  followUps(part: MessagePart): string[] {
    const data = (part as { data?: { questions?: unknown } }).data;

    return Array.isArray(data?.questions) ? data.questions.filter((q): q is string => typeof q === 'string') : [];
  }

  json(value: unknown) {
    return JSON.stringify(value ?? null, null, 2);
  }

  text(part: MessagePart) {
    return (part as { text?: string }).text ?? '';
  }

  private scrollDown() {
    setTimeout(() => {
      const element = this.scroller?.nativeElement;
      element?.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    });
  }
}
