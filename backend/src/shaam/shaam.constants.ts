export enum ShaamEnvironment {
  TSANDBOX = 'tsandbox',
  PRODUCTION = 'production',
}

export const SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED =
  'SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED';
export const DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER = '777777715';

export function isShaamTsandboxInvoiceBusinessAllowed(
  businessNumber: string | null | undefined,
): boolean {
  const configured = process.env.SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBERS?.split(
    ',',
  )
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = configured?.length
    ? configured
    : [DEFAULT_SHAAM_TSANDBOX_INVOICE_BUSINESS_NUMBER];
  return allowed.includes(String(businessNumber || '').trim());
}

export interface ShaamUrls {
  authorize: string;
  token: string;
  invoicesApproval: string;
  invoiceConfirmation: string;
  invoiceDetails: string;
}

const TSANDBOX_URLS: ShaamUrls = {
  authorize:
    'https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/authorize',
  // The downloaded OpenAPI document also lists t-ita-api as its token URL,
  // but that hostname is not publicly resolvable in the verified sandbox flow.
  // The public openapi gateway is the endpoint that completes token exchange.
  token:
    'https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/token',
  invoicesApproval:
    'https://openapi.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval',
  invoiceConfirmation:
    'https://ita-api.taxes.gov.il/shaam/tsandbox/invoice-information/v2/confirmationNumber',
  invoiceDetails:
    'https://ita-api.taxes.gov.il/shaam/tsandbox/invoice-information/v2/details',
};

const PRODUCTION_URL_RULES: Record<
  keyof ShaamUrls,
  {
    hosts: string[];
    path: string;
  }
> = {
  authorize: {
    hosts: ['openapi.taxes.gov.il'],
    path: '/shaam/production/longtimetoken/oauth2/authorize',
  },
  token: {
    hosts: ['openapi.taxes.gov.il', 't-ita-api.taxes.gov.il'],
    path: '/shaam/production/longtimetoken/oauth2/token',
  },
  invoicesApproval: {
    hosts: [
      'openapi.taxes.gov.il',
      't-ita-api.taxes.gov.il',
      'ita-api.taxes.gov.il',
    ],
    path: '/shaam/production/Invoices/v2/Approval',
  },
  invoiceConfirmation: {
    hosts: [
      'openapi.taxes.gov.il',
      't-ita-api.taxes.gov.il',
      'ita-api.taxes.gov.il',
    ],
    path: '/shaam/production/invoice-information/v2/confirmationNumber',
  },
  invoiceDetails: {
    hosts: [
      'openapi.taxes.gov.il',
      't-ita-api.taxes.gov.il',
      'ita-api.taxes.gov.il',
    ],
    path: '/shaam/production/invoice-information/v2/details',
  },
};

export function getShaamUrls(
  env: string = ShaamEnvironment.TSANDBOX,
): ShaamUrls {
  const normalizedEnv = env?.toLowerCase() || ShaamEnvironment.TSANDBOX;

  if (normalizedEnv === ShaamEnvironment.PRODUCTION) {
    if (process.env.SHAAM_INVOICE_PRODUCTION_ENABLED !== 'true') {
      throw new Error('SHAAM invoice-allocation production is disabled');
    }
    const urls: ShaamUrls = {
      authorize: process.env.SHAAM_INVOICE_AUTHORIZE_URL || '',
      token: process.env.SHAAM_INVOICE_TOKEN_URL || '',
      invoicesApproval: process.env.SHAAM_INVOICE_APPROVAL_URL || '',
      invoiceConfirmation: process.env.SHAAM_INVOICE_CONFIRMATION_URL || '',
      invoiceDetails: process.env.SHAAM_INVOICE_DETAILS_URL || '',
    };
    for (const [name, rule] of Object.entries(PRODUCTION_URL_RULES)) {
      const value = urls[name as keyof typeof PRODUCTION_URL_RULES];
      let parsed: URL;
      try {
        parsed = new URL(value as string);
      } catch {
        throw new Error(`Missing or invalid production SHAAM URL: ${name}`);
      }
      if (
        parsed.protocol !== 'https:' ||
        !rule.hosts.includes(parsed.hostname) ||
        parsed.pathname !== rule.path ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error(`Invalid production SHAAM URL: ${name}`);
      }
    }
    return urls;
  }
  if (normalizedEnv !== ShaamEnvironment.TSANDBOX) {
    throw new Error('SHAAM_ENV must be either tsandbox or production');
  }
  return TSANDBOX_URLS;
}

const SHAAM_SCOPE_NAME_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function parseShaamScopes(value: string | null | undefined): string[] {
  const scopes = String(value || '')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const unique = [...new Set(scopes)];
  const invalid = unique.find((scope) => !SHAAM_SCOPE_NAME_PATTERN.test(scope));
  if (invalid) throw new Error('Invalid SHAAM scope configuration');
  return unique;
}

/**
 * Scopes for Tax Authority APIs that share the long-time-token grant.
 * The Tax Authority requires a comma-delimited value at authorization,
 * code-exchange and refresh. Daily-token products (for example Uniform File)
 * are intentionally configured and authorized separately.
 */
export function getShaamLongTokenScopes(
  env: string = ShaamEnvironment.TSANDBOX,
): string[] {
  const configured = process.env.SHAAM_SCOPES?.trim();
  if (configured) {
    const scopes = parseShaamScopes(configured);
    if (scopes.length) return scopes;
  }
  if (env.toLowerCase() === ShaamEnvironment.PRODUCTION) {
    throw new Error('SHAAM_SCOPES is required in production');
  }
  return ['scope']; // Historical sandbox registration value only.
}

export function getShaamLongTokenScopeParameter(
  env: string = ShaamEnvironment.TSANDBOX,
): string {
  return getShaamLongTokenScopes(env).join(',');
}

export function getMissingShaamScopes(
  granted: string | null | undefined,
  required: readonly string[],
): string[] {
  const grantedSet = new Set(parseShaamScopes(granted));
  return required.filter((scope) => !grantedSet.has(scope));
}
export const REQUEST_TIMEOUT_MS = 10000;
