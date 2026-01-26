export enum ShaamEnvironment {
  TSANDBOX = 'tsandbox',
  PRODUCTION = 'production',
}

export interface ShaamUrls {
  authorize: string;
  token: string;
  invoicesApproval: string;
}

const TSANDBOX_URLS: ShaamUrls = {
  authorize: 'https://openapi.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/authorize',
  token: 'https://t-ita-api.taxes.gov.il/shaam/tsandbox/longtimetoken/oauth2/token',
  invoicesApproval: 'https://t-ita-api.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval',
};

// TODO: Add production URLs when ready
const PRODUCTION_URLS: ShaamUrls = {
  authorize: '', // To be filled when production is ready
  token: '', // To be filled when production is ready
  invoicesApproval: '', // To be filled when production is ready
};

export function getShaamUrls(env: string = ShaamEnvironment.TSANDBOX): ShaamUrls {
  const normalizedEnv = env?.toLowerCase() || ShaamEnvironment.TSANDBOX;
  
  if (normalizedEnv === ShaamEnvironment.PRODUCTION) {
    // For now, throw error if production is requested but not configured
    throw new Error('Production environment is not yet configured. Use tsandbox.');
  }
  
  return TSANDBOX_URLS;
}

export const SHAAM_SCOPE = 'scope';
export const REQUEST_TIMEOUT_MS = 10000;

