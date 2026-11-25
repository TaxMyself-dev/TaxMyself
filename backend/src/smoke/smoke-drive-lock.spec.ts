import { withSmokeDriveLock } from './smoke-drive-lock';
import { ACQUIRE_DRIVE_LOCK, RELEASE_DRIVE_LOCK } from '../users/drive-provisioning-lock';

describe('smoke Drive lock wait', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
  afterEach(() => { warn.mockRestore(); });

  it('waits through busy provisioning and cleans only after acquiring the same UID lock', async () => {
    const action = jest.fn().mockResolvedValue('cleaned');
    const query = jest.fn()
      .mockImplementationOnce(async () => { expect(action).not.toHaveBeenCalled(); return [{ acquired: 0 }]; })
      .mockImplementationOnce(async () => { expect(action).not.toHaveBeenCalled(); return [{ acquired: 0 }]; })
      .mockResolvedValueOnce([{ acquired: 1 }])
      .mockResolvedValueOnce([{ released: 1 }]);
    await expect(withSmokeDriveLock(query, 'exact-uid', action)).resolves.toBe('cleaned');
    expect(query.mock.calls).toEqual([
      [ACQUIRE_DRIVE_LOCK, ['exact-uid']], [ACQUIRE_DRIVE_LOCK, ['exact-uid']],
      [ACQUIRE_DRIVE_LOCK, ['exact-uid']], [RELEASE_DRIVE_LOCK, ['exact-uid']],
    ]);
    expect(action).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it.each([0, 3])('acquires after %s timeouts, including the final allowed attempt', async busyAttempts => {
    let calls = 0;
    const query = jest.fn(async (sql: string) => sql === RELEASE_DRIVE_LOCK
      ? [{ released: 1 }]
      : [{ acquired: calls++ < busyAttempts ? '0' : '1' }]);
    const action = jest.fn().mockResolvedValue(undefined);
    await withSmokeDriveLock(query, 'uid', action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(busyAttempts + 2);
    expect(warn).toHaveBeenCalledTimes(busyAttempts);
  });
  it('bounds waiting and never cleans or releases a lock it does not own', async () => {
    const query = jest.fn().mockResolvedValue([{ acquired: 0 }]);
    const action = jest.fn();
    await expect(withSmokeDriveLock(query, 'uid', action)).rejects.toThrow('after 4 attempts');
    expect(query).toHaveBeenCalledTimes(4);
    expect(action).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 2])('fails closed without retry for invalid result %s', async acquired => {
    const query = jest.fn().mockResolvedValue([{ acquired }]);
    const action = jest.fn();
    await expect(withSmokeDriveLock(query, 'uid', action)).rejects.toThrow('invalid');
    expect(query).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });

  it('propagates database errors without retry or cleanup', async () => {
    const query = jest.fn().mockRejectedValue(new Error('database unavailable'));
    const action = jest.fn();
    await expect(withSmokeDriveLock(query, 'uid', action)).rejects.toThrow('database unavailable');
    expect(query).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });

  it('releases the acquired lock if cleanup fails and never retries destructive work', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ acquired: '1' }]).mockResolvedValueOnce([{ released: 1 }]);
    const action = jest.fn().mockRejectedValue(new Error('deletion failed'));
    await expect(withSmokeDriveLock(query, 'uid', action)).rejects.toThrow('deletion failed');
    expect(query).toHaveBeenLastCalledWith(RELEASE_DRIVE_LOCK, ['uid']);
    expect(action).toHaveBeenCalledTimes(1);
  });
});
