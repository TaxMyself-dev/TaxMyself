import {
  getMissingShaamScopes,
  getShaamLongTokenScopeParameter,
  parseShaamScopes,
  ShaamEnvironment,
} from './shaam.constants';

describe('SHAAM long-time-token scopes', () => {
  const originalScopes = process.env.SHAAM_SCOPES;

  afterEach(() => {
    if (originalScopes === undefined) {
      delete process.env.SHAAM_SCOPES;
    } else {
      process.env.SHAAM_SCOPES = originalScopes;
    }
  });

  it('normalizes and deduplicates comma-delimited configured scopes', () => {
    process.env.SHAAM_SCOPES =
      'invoices_scope, donations_scope,invoices_scope';

    expect(getShaamLongTokenScopeParameter(ShaamEnvironment.PRODUCTION)).toBe(
      'invoices_scope,donations_scope',
    );
  });

  it('accepts provider-returned scopes separated by commas or whitespace', () => {
    expect(parseShaamScopes('invoices_scope donations_scope')).toEqual([
      'invoices_scope',
      'donations_scope',
    ]);
    expect(
      getMissingShaamScopes('invoices_scope,donations_scope', [
        'invoices_scope',
        'donations_scope',
      ]),
    ).toEqual([]);
  });

  it('reports only scopes absent from the saved grant', () => {
    expect(
      getMissingShaamScopes('invoices_scope', [
        'invoices_scope',
        'donations_scope',
      ]),
    ).toEqual(['donations_scope']);
  });

  it('fails closed in production when SHAAM_SCOPES is missing', () => {
    delete process.env.SHAAM_SCOPES;

    expect(() =>
      getShaamLongTokenScopeParameter(ShaamEnvironment.PRODUCTION),
    ).toThrow('SHAAM_SCOPES is required in production');
  });
});
