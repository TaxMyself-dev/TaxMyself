import { devAgentApprovalView } from './dev-agent-chat-parts';
import {
  DevAgentMessage,
  DevAgentPart,
  devAgentFollowUps,
  devAgentQuestionView,
  devAgentSavedMemory,
  devAgentShouldContinue,
  withDevAgentFollowUps,
} from './dev-agent-chat-parts';
import { devAgentHeaders, createDevAgentChat } from './dev-agent-chat';

type Part = DevAgentPart;

const questionPart = (state: string, output?: unknown, options: unknown[] = [
  { label: 'סטודיו נועה', value: '514789632' },
  { label: 'בשני העסקים', value: 'all' },
]): Part =>
  ({
    type: 'tool-askUserQuestion',
    toolCallId: 'ask-1',
    state,
    input: { question: 'באיזה עסק?', options },
    ...(output !== undefined && { output }),
  }) as unknown as Part;

const answer = (parts: Part[], id = 'a1'): DevAgentMessage => ({ id, role: 'assistant', parts });

describe('dev agent chat (Phase 3.1)', () => {
  describe('devAgentQuestionView', () => {
    it('shows an open question with its labels and values, from the stored part', () => {
      const view = devAgentQuestionView(questionPart('input-available'));

      expect(view?.status).toBe('open');
      expect(view?.question).toBe('באיזה עסק?');
      expect(view?.options).toEqual([
        { label: 'סטודיו נועה', value: '514789632' },
        { label: 'בשני העסקים', value: 'all' },
      ]);
    });

    it('shows an answered, a superseded and a template question as closed', () => {
      expect(devAgentQuestionView(questionPart('output-available', { value: 'all', label: 'בשני העסקים' }))).toEqual(
        jasmine.objectContaining({ status: 'answered', answeredLabel: 'בשני העסקים' }),
      );
      expect(devAgentQuestionView(questionPart('output-available', { superseded: true }))?.status).toBe('superseded');

      const legacy = devAgentQuestionView(questionPart('output-available', { asked: true }, ['השנה', 'החודש']));
      expect(legacy?.status).toBe('legacy');
      expect(legacy?.options).toEqual([
        { label: 'השנה', value: 'השנה' },
        { label: 'החודש', value: 'החודש' },
      ]);
    });

    it('is null for any other part', () => {
      expect(devAgentQuestionView({ type: 'text', text: 'hi' } as unknown as Part)).toBeNull();
    });
  });

  describe('devAgentShouldContinue', () => {
    it('continues once after a question pressed on this page, never for an old or unanswered one', () => {
      const pending = new Set(['ask-1']);

      expect(devAgentShouldContinue([answer([questionPart('input-available')])], pending)).toBeFalse();
      expect(
        devAgentShouldContinue([answer([questionPart('output-available', { value: 'all', label: 'x' })])], pending),
      ).toBeTrue();
      // The press is sent once.
      expect(
        devAgentShouldContinue([answer([questionPart('output-available', { value: 'all', label: 'x' })])], pending),
      ).toBeFalse();
      // A question answered before this page opened (a reload) does not resend.
      expect(
        devAgentShouldContinue([answer([questionPart('output-available', { value: 'all', label: 'x' })])], new Set()),
      ).toBeFalse();
    });
  });

  describe('follow-ups', () => {
    const followUps = { type: 'data-followUps', data: { questions: ['ולפי חודשים?'] } } as unknown as Part;

    it('reads a stored follow-ups part', () => {
      expect(devAgentFollowUps(followUps)).toEqual(['ולפי חודשים?']);
      expect(devAgentFollowUps({ type: 'text', text: 'x' } as unknown as Part)).toEqual([]);
    });

    it('adds fetched follow-ups to their answer once', () => {
      const messages = [answer([{ type: 'text', text: '1,662 ₪' } as unknown as Part])];
      const once = withDevAgentFollowUps(messages, 'a1', ['ולפי חודשים?']);
      const twice = withDevAgentFollowUps(once, 'a1', ['ולפי חודשים?']);

      expect(devAgentFollowUps(once[0].parts[1])).toEqual(['ולפי חודשים?']);
      expect(twice[0].parts.length).toBe(2);
      expect(withDevAgentFollowUps(messages, 'a1', [])).toBe(messages);
    });
  });

  it('reads a saved memory for its notice, with its kind', () => {
    const saved = {
      type: 'tool-saveAgentMemory',
      toolCallId: 'save-1',
      state: 'output-available',
      input: { content: 'עובד מהבית' },
      output: { id: '6f1c2a1e-1111-4a1a-8a1a-111111111111', content: 'עובד מהבית', kind: 'business_fact' },
    } as unknown as Part;

    expect(devAgentSavedMemory(saved)).toEqual({
      memoryId: '6f1c2a1e-1111-4a1a-8a1a-111111111111',
      content: 'עובד מהבית',
      kind: 'business_fact',
    });
    expect(devAgentSavedMemory(questionPart('input-available'))).toBeNull();
  });
});

// Business selection (2026-11-15): the chat never forwards the app's active
// business, which another screen leaves behind; the agent resolves the
// business from the conversation and asks when it is ambiguous.
describe('dev agent chat request headers (business selection)', () => {
  it('sends the token and the client, never a businessnumber header', async () => {
    const headers = await devAgentHeaders({
      token: async () => 'token-1',
      clientId: () => 'client-1',
    });

    expect(headers).toEqual({
      Authorization: 'Bearer token-1',
      'x-client-user-id': 'client-1',
    });
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('businessnumber');
  });
});

describe('approval cards after clarification',()=>{
  const part:any={type:'tool-classifyTransaction',state:'approval-requested',approval:{id:'a'}};
  const original:any={id:'old',role:'assistant',parts:[part]};
  it('allows only the latest assistant card and immediately closes it after a typed question',()=>{
    expect(devAgentApprovalView(part,'old',[original])).toEqual({id:'a',active:true});
    const question:any={id:'q',role:'user',parts:[{type:'text',text:'למה פעמיים?'}]};
    const answer:any={id:'new',role:'assistant',parts:[{type:'text',text:'שני שמות'}]};
    expect(devAgentApprovalView(part,'old',[original,question])).toEqual({id:'a',active:false});
    expect(devAgentApprovalView(part,'old',[original,question,answer])).toEqual({id:'a',active:false});
  });
  it('keeps historical and persisted superseded cards inactive after reload',()=>{
    const closed:any={...part,state:'output-denied',approval:{id:'a',approved:false,reason:'Superseded by a newer user message; request a fresh approval card.'}};
    expect(devAgentApprovalView(closed,'old',[{...original,parts:[closed]}])).toEqual({id:'a',active:false});
    expect(devAgentApprovalView({...part,state:'output-available'},'old',[original])).toBeNull();
  });
});

describe("shared chat completion outcome", () => {
  it("preserves streaming failure flags instead of reporting successful completion", async () => {
    spyOn(window, "fetch").and.resolveTo(
      new Response(
        'data: {"type":"start","messageId":"assistant-error"}\n\ndata: {"type":"error","errorText":"synthetic stream failure"}\n\ndata: [DONE]\n\n',
        {
          headers: {
            "content-type": "text/event-stream",
            "x-vercel-ai-ui-message-stream": "v1",
          },
        },
      ),
    );
    const onFinish = jasmine.createSpy();
    const onError = jasmine.createSpy();
    const chat = createDevAgentChat({
      apiUrl: "http://localhost:3004/",
      conversationId: crypto.randomUUID(),
      agentUserId: crypto.randomUUID(),
      locale: "he",
      auth: { token: () => Promise.resolve("token"), clientId: () => null },
      onFinish,
      onError,
    });
    await chat.sendMessage({ text: "מה עוד לספר עליי?" });
    expect(onError).toHaveBeenCalled();
    expect(onFinish).toHaveBeenCalledWith(
      jasmine.objectContaining({ isError: true }),
    );
  });
});
