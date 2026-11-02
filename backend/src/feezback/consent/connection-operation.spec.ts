import { connectionOperation } from './connection-operation';

describe('connection operation ordering', () => {
  it('serializes same owner but permits other owners to proceed', async () => {
    let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    const order: string[] = [];
    const first = connectionOperation('owner', async () => { order.push('old discovery'); await held; order.push('discovery done'); });
    const second = connectionOperation('owner', async () => { order.push('disconnect verified'); });
    await connectionOperation('other', async () => { order.push('other owner'); });
    expect(order).toEqual(['old discovery', 'other owner']);
    finish(); await Promise.all([first, second]);
    expect(order).toEqual(['old discovery', 'other owner', 'discovery done', 'disconnect verified']);
  });
  it('a failed provider operation does not poison subsequent requests', async () => {
    await expect(connectionOperation('retry', async () => { throw Error('unavailable'); })).rejects.toThrow('unavailable');
    await expect(connectionOperation('retry', async () => 'recovered')).resolves.toBe('recovered');
  });
});
