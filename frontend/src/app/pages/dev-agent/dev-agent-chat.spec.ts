import {
  DevAgentMessage,
  DevAgentPart,
  devAgentFollowUps,
  devAgentQuestionView,
  devAgentSavedMemory,
  devAgentShouldContinue,
  withDevAgentFollowUps,
} from './dev-agent-chat-parts';

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
