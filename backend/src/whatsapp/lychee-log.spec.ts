import { Logger } from '@nestjs/common';
import { lycheeLog, lycheeStep, LycheeStepError } from './lychee-log';

describe('Lychee operational logs', () => {
  const lines: string[] = [];
  beforeEach(() => {
    lines.length = 0;
    jest.spyOn(Logger.prototype, 'debug').mockImplementation((value) => {
      lines.push(String(value));
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((value) => {
      lines.push(String(value));
    });
  });
  afterEach(() => jest.restoreAllMocks());
  it('explains provider errors with event and stage without exposing the original response or config', async () => {
    const original = {
      response: { status: 500, data: 'private document text SECRET' },
      config: {
        headers: { Authorization: 'Bearer SECRET' },
        url: 'https://private/file?token=SECRET',
      },
      message: 'SECRET',
    };
    await expect(
      lycheeStep('event-1', 'media.link', 'בקשת קישור מליצ׳י', async () => {
        throw original;
      }),
    ).rejects.toBeInstanceOf(LycheeStepError);
    const entries = lines.map((line) => JSON.parse(line));
    expect(entries[1]).toMatchObject({
      event_id: 'event-1',
      stage: 'media.link',
      outcome: 'failed',
      httpStatus: 500,
    });
    expect(entries[1].message).toContain('שגיאת שרת');
    expect(lines.join('')).not.toContain('SECRET');
    expect(lines.join('')).not.toContain('private');
  });
  it('does not log arbitrary exception text or unsafe event identifiers', async () => {
    await expect(
      lycheeStep('bad\nSECRET', 'queue.save', 'שמירת אירוע', async () => {
        throw new Error('SECRET user@email.com signed-url');
      }),
    ).rejects.toBeInstanceOf(LycheeStepError);
    expect(lines.join('')).not.toContain('SECRET');
    expect(lines.join('')).not.toContain('user@email.com');
    expect(JSON.parse(lines[1]).event_id).toBeUndefined();
  });
  it('records successful stage duration and safe metadata as structured JSON', async () => {
    expect(
      await lycheeStep('event-2', 'media.download', 'הורדה', async () => 3),
    ).toBe(3);
    lycheeLog('event-2', 'media.ready', 'completed', 'הקובץ מוכן', {
      bytes: 123,
    });
    expect(JSON.parse(lines[1]).durationMs).toEqual(expect.any(Number));
    expect(JSON.parse(lines[2])).toMatchObject({
      event_id: 'event-2',
      bytes: 123,
    });
  });
});
