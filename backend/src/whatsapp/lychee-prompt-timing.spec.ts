import { Logger } from '@nestjs/common';
import { timePromptStage } from './lychee-prompt-timing';

describe('Question timing diagnostics — fake clock and operations only', () => {
  it('measures elapsed time without logging operation results', async () => {
    let now = 1000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
    try {
      const result = await timePromptStage(
        'test-event',
        'business.prompt.db.receipt',
        'שמירת מזהה השאלה',
        async () => {
          now += 125;
          return { token: 'private-secret', phone: '972501234567' };
        },
      );
      expect(result.token).toBe('private-secret');
      const lines = debug.mock.calls.map((args) =>
        JSON.parse(args[0] as string),
      );
      expect(lines[1]).toMatchObject({
        stage: 'business.prompt.db.receipt',
        outcome: 'completed',
        durationMs: 125,
      });
      expect(JSON.stringify(lines)).not.toContain('private-secret');
      expect(JSON.stringify(lines)).not.toContain('972501234567');
    } finally {
      clock.mockRestore();
      debug.mockRestore();
    }
  });
  it('records failure duration and rethrows the same exception without retry or raw error text', async () => {
    let now = 1000;
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const debug = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => {});
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const error = new Error('Authorization: Bearer private-secret');
    const work = jest.fn(async () => {
      now += 700;
      throw error;
    });
    try {
      await expect(
        timePromptStage(
          'test-event',
          'business.prompt.http.send',
          'בקשת שליחה לליצ׳י',
          work,
        ),
      ).rejects.toBe(error);
      expect(work).toHaveBeenCalledTimes(1);
      const line = JSON.parse(warn.mock.calls[0][0] as string);
      expect(line).toMatchObject({ outcome: 'failed', durationMs: 700 });
      expect(JSON.stringify(line)).not.toContain('private-secret');
    } finally {
      clock.mockRestore();
      debug.mockRestore();
      warn.mockRestore();
    }
  });
});
