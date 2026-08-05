import * as crypto from 'crypto';

/**
 * AES-256-GCM encryption for OAuth tokens stored in user_integrations
 * (refresh_token / access_token).
 *
 * Why encryption is required:
 *   A refresh token is a long-lived bearer credential — anyone who possesses
 *   it can obtain access tokens for the user's external account (Gmail, Drive,
 *   etc.). Storing it in plaintext means a DB read (SQL injection, backup leak,
 *   insider access) directly yields account access. AES-256-GCM provides
 *   authenticated encryption: the ciphertext is useless without the key AND
 *   the auth tag prevents silent tampering.
 *
 * The key is intentionally separate from SHAAM_TOKEN_ENC_KEY_B64 and
 * BILLING_TOKEN_ENCRYPTION_KEY so that a compromise in one subsystem does not
 * expose tokens in the others.
 *
 * Key format: base64-encoded 32-byte value (256 bits).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 128-bit random IV, unique per encryption
const AUTH_TAG_LENGTH = 16; // 128-bit GCM authentication tag
const KEY_LENGTH = 32;      // 256-bit key

function getKey(): Buffer {
  const raw = process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'INTEGRATION_TOKEN_ENCRYPTION_KEY environment variable is not set. ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `INTEGRATION_TOKEN_ENCRYPTION_KEY has invalid length: expected ${KEY_LENGTH} bytes, ` +
        `got ${key.length}. Provide a base64-encoded 32-byte value.`,
    );
  }
  return key;
}

/**
 * Encrypts an OAuth token for storage in the database.
 * Output format (base64): IV (16 bytes) | AuthTag (16 bytes) | Ciphertext
 * Never log the input or output of this function.
 */
export function encryptIntegrationToken(token: string): string {
  if (!token) throw new Error('Integration token cannot be empty');

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;

  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a stored OAuth token, immediately before calling the provider API.
 * Never log the return value of this function.
 */
export function decryptIntegrationToken(encryptedToken: string): string {
  if (!encryptedToken) throw new Error('Encrypted integration token cannot be empty');

  const key = getKey();

  try {
    const combined = Buffer.from(encryptedToken, 'base64');
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted token: buffer too short');
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err: any) {
    if (err.message?.includes('bad decrypt') || err.message?.includes('Unsupported state')) {
      throw new Error('Integration token decryption failed: authentication tag mismatch');
    }
    throw new Error(`Integration token decryption failed: ${err.message}`);
  }
}
