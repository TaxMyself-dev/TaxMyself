import * as crypto from 'crypto';

export interface HmacHeaders {
  'X-API-KEY': string;
  'X-TIMESTAMP': string;
  'X-SIGNATURE': string;
  'Content-Type': string;
  [key: string]: string; // Index signature for Axios compatibility
}

/**
 * Generates HMAC-signed headers for agent API requests
 * 
 * @param method - HTTP method (e.g., 'GET', 'POST')
 * @param path - Request path (e.g., '/agent/ping')
 * @param body - Raw request body as string (empty string for GET requests)
 * @param apiKey - Agent API key
 * @param secret - Agent secret for HMAC signing
 * @returns Headers object with X-API-KEY, X-TIMESTAMP, X-SIGNATURE, and Content-Type
 */
export function generateHmacHeaders(
  method: string,
  path: string,
  body: string,
  apiKey: string,
  secret: string,
): Record<string, string> {
  // Generate timestamp
  const timestamp = Date.now().toString();

  // Build canonical string: METHOD\nPATH\nTIMESTAMP\nRAW_BODY
  const canonicalString = `${method.toUpperCase()}\n${path}\n${timestamp}\n${body}`;

  // Calculate HMAC-SHA256 signature
  const signature = crypto
    .createHmac('sha256', secret)
    .update(canonicalString)
    .digest('hex');

  return {
    'X-API-KEY': apiKey,
    'X-TIMESTAMP': timestamp,
    'X-SIGNATURE': signature,
    'Content-Type': 'application/json',
  };
}


