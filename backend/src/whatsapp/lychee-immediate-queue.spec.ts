import { LycheeImmediateQueue } from './lychee-immediate-queue';

describe('Immediate queue scheduling — fake timers only', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('coalesces repeated signals and drains durable work until an empty claim', async () => {
    let busy = false;
    const jobs = ['one', 'two'];
    const work = jest.fn();
    const run = jest.fn(async () => {
      busy = true;
      const job = jobs.shift();
      if (job) work(job);
      busy = false;
      wake.idle(!!job);
    });
    const wake = new LycheeImmediateQueue(run, () => busy, jest.fn());
    for (let i = 0; i < 20; i++) wake.request();
    expect(run).not.toHaveBeenCalled();
    await jest.runAllTimersAsync();
    expect(work.mock.calls).toEqual([['one'], ['two']]);
    expect(run).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
    wake.stop();
  });

  it('retains a wake arriving while a periodic worker is busy', async () => {
    let busy = true;
    const run = jest.fn(async () => wake.idle(false));
    const wake = new LycheeImmediateQueue(run, () => busy, jest.fn());
    wake.request();
    await jest.runAllTimersAsync();
    expect(run).not.toHaveBeenCalled();
    busy = false;
    wake.idle(true);
    await jest.runAllTimersAsync();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not lose a scheduled signal if a periodic tick starts first', async () => {
    let busy = false;
    const run = jest.fn(async () => wake.idle(false));
    const wake = new LycheeImmediateQueue(run, () => busy, jest.fn());
    wake.request();
    busy = true;
    await jest.runAllTimersAsync();
    expect(run).not.toHaveBeenCalled();
    busy = false;
    wake.idle(false);
    await jest.runAllTimersAsync();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not run canceled callbacks or reschedule after shutdown', async () => {
    const run = jest.fn(async () => {});
    const wake = new LycheeImmediateQueue(run, () => false, jest.fn());
    wake.request();
    wake.stop();
    wake.idle(true);
    wake.request();
    await jest.runAllTimersAsync();
    expect(run).not.toHaveBeenCalled();
  });

  it('reports unexpected failures without an unhandled rejection or immediate retry loop', async () => {
    const error = jest.fn();
    const run = jest.fn().mockRejectedValue(new Error('fake failure'));
    const wake = new LycheeImmediateQueue(run, () => false, error);
    wake.request();
    await jest.runAllTimersAsync();
    expect(error).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
