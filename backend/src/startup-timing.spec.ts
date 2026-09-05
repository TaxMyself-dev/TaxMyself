import { EventEmitter } from 'events';
import {
  STARTUP_TIMING_PREFIX,
  StartupTiming,
  isStartupTimingEnabled,
} from './startup-timing';

describe('startup timing', () => {
  it('is disabled by default and emits nothing', async () => {
    const lines: string[] = [];
    const timing = new StartupTiming(lines.push.bind(lines), undefined, 0, {});

    expect(isStartupTimingEnabled({})).toBe(false);
    timing.mark('bootstrap.entry');
    await timing.measureAsync('operation.complete', async () => 'result');

    expect(lines).toEqual([]);
  });

  it('emits stable, parseable timing records', async () => {
    const lines: string[] = [];
    let now = BigInt(2_000_000_000);
    const timing = new StartupTiming(lines.push.bind(lines), () => now, 1, {
      STARTUP_TIMING: 'true',
    });

    timing.mark('bootstrap.entry', 'milestone');
    const startedAt = timing.start();
    now += BigInt(2_500_000);
    timing.complete('listen.complete', startedAt);

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      `${STARTUP_TIMING_PREFIX}{"event":"bootstrap.entry","elapsed_ms":1000,"kind":"milestone"}`,
    );
    expect(JSON.parse(lines[1].slice(STARTUP_TIMING_PREFIX.length))).toEqual({
      event: 'listen.complete',
      duration_ms: 2.5,
      elapsed_ms: 1002.5,
    });
  });

  it('measures the first request once without reading request data', () => {
    const lines: string[] = [];
    let now = BigInt(5_000_000_000);
    const timing = new StartupTiming(lines.push.bind(lines), () => now, 2, {
      STARTUP_TIMING: 'true',
    });
    const middleware = timing.firstRequestMiddleware();
    const sensitiveRequest = new Proxy(
      {},
      {
        get: () => {
          throw new Error('request data must not be read');
        },
      },
    );
    const firstResponse = new EventEmitter();
    const secondResponse = new EventEmitter();

    expect(() =>
      middleware(sensitiveRequest as any, firstResponse as any, jest.fn()),
    ).not.toThrow();
    now += BigInt(4_000_000);
    firstResponse.emit('finish');
    firstResponse.emit('close');
    middleware(sensitiveRequest as any, secondResponse as any, jest.fn());
    secondResponse.emit('finish');

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].slice(STARTUP_TIMING_PREFIX.length))).toEqual({
      event: 'http.first_request.complete',
      duration_ms: 4,
      elapsed_ms: 2004,
      process_to_request_ms: 2000,
    });
    expect(lines[0]).not.toContain('header');
    expect(lines[0]).not.toContain('query');
  });
});
