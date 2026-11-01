import { lycheeResponseShape } from './lychee-response-shape';

describe('Response schema diagnostics — no values', () => {
  it('describes nested fields and types without primitive values or array lengths', () => {
    const result = lycheeResponseShape({
      ok: true,
      data: {
        message: {
          id: 'private-id',
          whatsapp_message_id: null,
          phone: '972501234567',
          text: 'private body',
          count: 987654,
        },
      },
      results: [{ id: 'private-array-id' }],
      error: null,
    });
    expect(result).toMatchObject({
      $: 'object',
      '$.ok': 'boolean',
      '$.data': 'object',
      '$.data.message.id': 'string',
      '$.data.message.whatsapp_message_id': 'null',
      '$.data.message.count': 'number',
      '$.results': 'array',
      '$.results[]': 'object',
      '$.results[].id': 'string',
      '$.error': 'null',
    });
    const text = JSON.stringify(result);
    for (const value of [
      'private-id',
      '972501234567',
      'private body',
      '987654',
      'private-array-id',
    ])
      expect(text).not.toContain(value);
  });
  it('omits credential subtrees, unsafe keys and configured secrets even when used as keys', () => {
    const prior = process.env.LYCHEE_API_KEY;
    process.env.LYCHEE_API_KEY = 'secretKeyUsedAsKey';
    try {
      const result = lycheeResponseShape({
        headers: { Authorization: 'Bearer private' },
        config: { secret: 'hidden' },
        'https://private.test/token': 'hidden',
        secretKeyUsedAsKey: 'hidden',
        '972501234567': 'hidden',
      });
      expect(result['$.headers']).toBe('omitted');
      const text = JSON.stringify(result);
      for (const value of [
        'Authorization',
        'Bearer private',
        'hidden',
        'private.test',
        'secretKeyUsedAsKey',
        '972501234567',
      ])
        expect(text).not.toContain(value);
    } finally {
      if (prior === undefined) delete process.env.LYCHEE_API_KEY;
      else process.env.LYCHEE_API_KEY = prior;
    }
  });
  it('bounds traversal, handles null, primitive bodies, cycles and accessors', () => {
    expect(lycheeResponseShape('private raw body')).toEqual({ $: 'string' });
    expect(lycheeResponseShape(null)).toEqual({ $: 'null' });
    const getter = jest.fn(() => {
      throw Error('must not execute');
    });
    const object: any = { nested: {} };
    object.nested.cycle = object;
    Object.defineProperty(object, 'value', { enumerable: true, get: getter });
    expect(() => lycheeResponseShape(object)).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    const wide = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [
        'field' + i,
        Object.fromEntries(
          Array.from({ length: 100 }, (_, j) => ['field' + j, 'private']),
        ),
      ]),
    );
    expect(Object.keys(lycheeResponseShape(wide)).length).toBeLessThanOrEqual(
      40,
    );
  });
});
