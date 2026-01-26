import { Injectable } from '@angular/core';

/**
 * Service to generate HMAC-SHA256 signatures for agent API requests
 * Uses Web Crypto API (available in modern browsers)
 */
@Injectable({
  providedIn: 'root'
})
export class HmacHelperService {

  /**
   * Generates HMAC-signed headers for agent API requests
   * 
   * @param method - HTTP method (e.g., 'GET', 'POST', 'PUT')
   * @param path - Request path (e.g., '/v1/agents/ping')
   * @param body - Raw request body as string (empty string for GET requests)
   * @param apiKey - Agent API key
   * @param secret - Agent secret for HMAC signing
   * @returns Promise that resolves to headers object with X-API-KEY, X-TIMESTAMP, X-SIGNATURE, and Content-Type
   */
  async generateHmacHeaders(
    method: string,
    path: string,
    body: string,
    apiKey: string,
    secret: string,
  ): Promise<Record<string, string>> {
    // Generate timestamp
    const timestamp = Date.now().toString();

    // Build canonical string: METHOD\nPATH\nTIMESTAMP\nRAW_BODY
    const canonicalString = `${method.toUpperCase()}\n${path}\n${timestamp}\n${body}`;

    // Calculate HMAC-SHA256 signature using Web Crypto API
    const signature = await this.calculateHmacSha256(secret, canonicalString);

    return {
      'X-API-KEY': apiKey,
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Calculate HMAC-SHA256 signature using Web Crypto API
   */
  private async calculateHmacSha256(secret: string, message: string): Promise<string> {
    // Import the secret key
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      {
        name: 'HMAC',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    );

    // Sign the message
    const signature = await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(message)
    );

    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }
}

