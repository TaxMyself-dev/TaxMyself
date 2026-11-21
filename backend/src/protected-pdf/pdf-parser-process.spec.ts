import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import { runIsolatedPdfParser } from './pdf-parser-process';
function child() {
  const c: any = new EventEmitter();
  c.stdin = new EventEmitter();
  c.stdin.end = jest.fn();
  c.kill = jest.fn();
  return c;
}
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
it('rejects a late crash even after a success payload, without leaking inherited credentials', async () => {
  const c = child(),
    spawn = jest.spyOn(childProcess, 'spawn').mockReturnValue(c);
  const pending = runIsolatedPdfParser(Buffer.from('%PDF-test'), 'inspect');
  c.emit('message', { kind: 'readable', pages: 1 });
  c.emit('close', 1);
  expect(await pending).toEqual({ kind: 'invalid' });
  expect(spawn.mock.calls[0][2]).toEqual(
    expect.objectContaining({
      windowsHide: true,
      env: expect.not.objectContaining({
        DB_PASSWORD: expect.anything(),
        COMPOSIO_API_KEY: expect.anything(),
      }),
    }),
  );
  expect(spawn.mock.calls[0][1]).toContain('--max-old-space-size=256');
});
it('kills a hung parser at its deadline', async () => {
  jest.useFakeTimers();
  const c = child();
  jest.spyOn(childProcess, 'spawn').mockReturnValue(c);
  const pending = runIsolatedPdfParser(Buffer.from('%PDF-test'), 'inspect');
  jest.advanceTimersByTime(15001);
  expect(await pending).toEqual({ kind: 'limit' });
  expect(c.kill).toHaveBeenCalledTimes(1);
  c.emit('close', 1);
});
it('contains spawn errors and stdin pipe failures', async () => {
  const c = child();
  jest.spyOn(childProcess, 'spawn').mockReturnValue(c);
  const pending = runIsolatedPdfParser(Buffer.from('%PDF-test'), 'inspect');
  c.emit('error', new Error('unavailable'));
  expect(await pending).toEqual({ kind: 'unavailable' });
  c.stdin.emit('error', new Error('EPIPE'));
  c.emit('close', 1);
});
it('does not accept a missing or invalid response as success', async () => {
  const c = child();
  jest.spyOn(childProcess, 'spawn').mockReturnValue(c);
  const pending = runIsolatedPdfParser(Buffer.from('%PDF-test'), 'inspect');
  c.emit('message', { kind: 'readable', pages: 0 });
  c.emit('close', 0);
  expect(await pending).toEqual({ kind: 'invalid' });
});
