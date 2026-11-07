import { devAgentApiOverride } from './dev-agent.route';

describe('devAgentApiOverride', () => {
  it('accepts a local backend and normalizes the trailing slash', () => {
    expect(devAgentApiOverride('http://localhost:3011')).toBe('http://localhost:3011/');
    expect(devAgentApiOverride('http://127.0.0.1:3011/')).toBe('http://127.0.0.1:3011/');
  });

  it('rejects missing or non-local backends (the chat sends them a Firebase token)', () => {
    expect(devAgentApiOverride(null)).toBeNull();
    expect(devAgentApiOverride('')).toBeNull();
    expect(devAgentApiOverride('https://localhost:3011/')).toBeNull();
    expect(devAgentApiOverride('http://evil.example.com:3011/')).toBeNull();
    expect(devAgentApiOverride('http://localhost:3011/api')).toBeNull();
  });
});
