import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import type { Chat } from '@ai-sdk/angular';
import type { UIMessage } from 'ai';
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { environment } from 'src/environments/environment';
import {
  callDevAgentFunction,
  createDevAgentChat,
  DevAgentChatContext,
  devAgentFollowUps,
  devAgentHeaders,
  devAgentQuestionView,
  DevAgentQuestionOption,
  DevAgentQuestionView,
  DevAgentRequestAuth,
  devAgentSavedMemory,
  DevAgentSavedMemory,
  fetchDevAgentFollowUps,
  fixedContextAuth,
  readDevAgentConversation,
  withDevAgentFollowUps,
} from './dev-agent-chat';
import { DEV_AGENT_FROM_ADMIN, devAgentApiOverride } from './dev-agent.route';

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

// A stored conversation the user can reopen (listAgentChatConversations).
interface DevAgentConversationRow {
  id: string;
  name: string | null;
  createdAt: string;
}

const uuidPattern = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

// Only a local backend may stand in for the app's (devAgentApiOverride).
const devAgentApiUrl = (override: string | null) => devAgentApiOverride(override) ?? environment.apiUrl;

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
 * or deny, askUserQuestion's buttons (answered by the page, Phase 3.1),
 * follow-ups as they are written and after a reload, a "saved" notice with
 * undo for a remembered fact, reasoning summaries and the stream's data
 * parts. The conversation is in the URL (?chat=), so a reload reopens it
 * and follows an answer still running. It is a test
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
  private readonly clientPanelService = inject(ClientPanelService);

  private readonly router = inject(Router);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  readonly examplePrompts = examplePrompts;
  // The backend the agent runs in: the app's, or another local one given as
  // ?api=http://localhost:3011/ (several worktrees' backends run side by side).
  // Read from the route, so it holds after an in-app navigation too.
  readonly apiUrl = devAgentApiUrl(this.query.get('api'));
  // Opened from the admin panel's "צ׳אט AI" tab: offer the way back.
  readonly fromAdminPanel = this.query.get('from') === DEV_AGENT_FROM_ADMIN;

  chat = signal<Chat<UIMessage> | null>(null);
  // The context the chat belongs to (agent user, client), read once per
  // session: a chat never moves to another client. The business is the
  // agent's to resolve from the conversation (never the app's active one).
  context = signal<DevAgentChatContext | null>(null);
  setupError = signal<string | null>(null);
  locale = signal<'he' | 'en'>('he');
  // The user's stored conversations, to reopen one.
  conversations = signal<DevAgentConversationRow[]>([]);
  // Memories whose "saved" notice was undone on this page.
  undoneMemories = signal<ReadonlySet<string>>(new Set());
  // Question calls pressed on this page, until the answer goes on.
  private pendingAnswers = new Set<string>();
  // The answer streaming now asked for follow-ups (data-followUpsPending).
  private followUpsPending = false;
  draft = '';

  private readonly auth: DevAgentRequestAuth = {
    token: async () => await firstValueFrom(this.afAuth.idToken.pipe(take(1))),
    clientId: () => this.clientPanelService.getSelectedClientId(),
  };

  agentUserId() {
    return this.context()?.agentUserId ?? null;
  }

  get clientId() {
    return this.context()?.clientId ?? null;
  }

  // Whether the app switched client since the chat's context was read: the
  // chat is then locked, and a new one starts for the new client
  // (startSession), so nothing from the previous client is used under the
  // new one. Switching business within the same client keeps the chat.
  get contextChanged() {
    const context = this.context();

    return context !== null && context.clientId !== this.auth.clientId();
  }

  async ngOnInit() {
    await this.startSession();
  }

  // Reads the agent's user for the app's current client, and starts a chat
  // for it.
  async startSession() {
    void this.chat()?.stop();
    this.chat.set(null);
    this.context.set(null);
    this.setupError.set(null);

    const live = { clientId: this.auth.clientId() };

    try {
      const response = await fetch(`${this.apiUrl}api/agent/fn/readAgentSession`, {
        headers: await devAgentHeaders(fixedContextAuth(this.auth, live)),
      });
      const body = await response.json();

      if (!response.ok || typeof body?.userId !== 'string') {
        throw new Error(`${response.status}: ${JSON.stringify(body)}`);
      }

      this.context.set({ agentUserId: body.userId, ...live });
      void this.refreshConversations();

      const stored = this.query.get('chat');

      if (stored && uuidPattern.test(stored)) {
        await this.openChat(stored);
      } else {
        this.newChat();
      }
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

  // Back to the admin panel, keeping the ?api= override for the next visit.
  backToAdminPanel() {
    const api = devAgentApiOverride(this.query.get('api'));
    void this.router.navigate(['/admin-panel'], { queryParams: api ? { api } : {} });
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
    this.startChat(context, crypto.randomUUID(), []);
  }

  // Reopens a stored conversation from its messages, and follows its answer
  // when one is still running (GET chats/:id/stream; 204 when none is).
  async openChat(conversationId: string) {
    const context = this.context();

    if (!context) {
      return;
    }

    void this.chat()?.stop();
    this.setupError.set(null);

    try {
      const messages = await readDevAgentConversation(
        this.apiUrl,
        fixedContextAuth(this.auth, context),
        context.agentUserId,
        conversationId,
      );
      const chat = this.startChat(context, conversationId, messages);
      void chat.resumeStream();
    } catch (error) {
      this.setupError.set(
        `The conversation could not be opened (${error instanceof Error ? error.message : String(error)}). A new chat was started.`,
      );
      this.newChat();
    }
  }

  async refreshConversations() {
    const context = this.context();

    if (!context) {
      return;
    }

    try {
      const rows = await callDevAgentFunction(
        this.apiUrl,
        fixedContextAuth(this.auth, context),
        'listAgentChatConversations',
        { userId: context.agentUserId },
      );
      this.conversations.set(Array.isArray(rows) ? (rows as DevAgentConversationRow[]).slice(0, 15) : []);
    } catch {
      this.conversations.set([]);
    }
  }

  private startChat(context: DevAgentChatContext, conversationId: string, messages: UIMessage[]) {
    this.pendingAnswers = new Set();
    this.followUpsPending = false;

    const auth = fixedContextAuth(this.auth, context);
    const chat = createDevAgentChat({
      apiUrl: this.apiUrl,
      conversationId,
      agentUserId: context.agentUserId,
      locale: this.locale(),
      auth,
      messages,
      pendingAnswers: this.pendingAnswers,
      onData: (part) => {
        if (part.type === 'data-followUpsPending') {
          this.followUpsPending = true;
        }
      },
      onFinish: () => {
        this.scrollDown();
        void this.loadFollowUps(chat, auth);
        void this.refreshConversations();
      },
      onError: () => this.scrollDown(),
    });

    this.chat.set(chat);
    // The conversation in the URL, so a reload reopens it.
    void this.router.navigate([], {
      queryParams: { chat: conversationId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.scrollDown();

    return chat;
  }

  // The follow-ups an answer gets are written after it ends: fetched when
  // the stream said so (data-followUpsPending), and added to the answer as
  // the server stores them.
  private async loadFollowUps(chat: Chat<UIMessage>, auth: DevAgentRequestAuth) {
    if (!this.followUpsPending) {
      return;
    }
    this.followUpsPending = false;

    const answer = chat.messages.at(-1);

    if (answer?.role !== 'assistant') {
      return;
    }

    const questions = await fetchDevAgentFollowUps(this.apiUrl, auth, chat.id, answer.id);

    if (this.chat() === chat) {
      chat.messages = withDevAgentFollowUps(chat.messages, answer.id, questions);
      this.scrollDown();
    }
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

  // A pressed follow-up: its text, sent as a press (the server checks it
  // against the stored follow-ups and records the origin; it writes nothing).
  sendFollowUp(question: string) {
    const chat = this.chat();

    if (!chat || this.isBusy(chat) || this.contextChanged) {
      return;
    }

    void chat.sendMessage({ text: question }, { body: { origin: 'follow-up' } });
    this.scrollDown();
  }

  // A pressed button of an open question: the page answers the call with the
  // option's value, and the answer continues (the server accepts only the
  // question's own values, once).
  answerQuestion(view: DevAgentQuestionView, option: DevAgentQuestionOption) {
    const chat = this.chat();

    if (!chat || view.status !== 'open' || this.isBusy(chat) || this.contextChanged) {
      return;
    }

    this.pendingAnswers.add(view.toolCallId);
    void chat.addToolOutput({
      tool: 'askUserQuestion',
      toolCallId: view.toolCallId,
      output: { value: option.value, label: option.label },
    } as never);
    this.scrollDown();
  }

  // The "saved" notice's undo: forgets the memory the agent saved.
  async undoMemory(memory: DevAgentSavedMemory) {
    const context = this.context();

    if (!context) {
      return;
    }

    try {
      await callDevAgentFunction(
        this.apiUrl,
        fixedContextAuth(this.auth, context),
        'deleteAgentMemory',
        { userId: context.agentUserId, memoryId: memory.memoryId },
        'POST',
      );
      this.undoneMemories.set(new Set([...this.undoneMemories(), memory.memoryId]));
    } catch (error) {
      this.setupError.set(`Undo failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // After a refused answer (a stale or repeated press), the stored
  // conversation is the truth: read it again.
  reloadChat() {
    const chat = this.chat();

    if (chat) {
      void this.openChat(chat.id);
    }
  }

  question(part: MessagePart) {
    return devAgentQuestionView(part);
  }

  savedMemory(part: MessagePart) {
    return devAgentSavedMemory(part);
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
    return devAgentFollowUps(part);
  }

  // Follow-ups show only under the newest answer, as in the template.
  isLastMessage(chat: Chat<UIMessage>, message: UIMessage) {
    return chat.messages.at(-1)?.id === message.id;
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
