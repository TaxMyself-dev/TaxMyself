import * as crypto from 'crypto';

/**
 * AES-256-GCM encryption for CardCom payment tokens stored in payment_method.cardcomToken.
 *
 * Why encryption is required:
 *   A CardCom token (GUID) is a bearer credential — anyone who possesses it can
 *   initiate charges against the customer's card via the CardCom recurring-charge API.
 *   Storing it in plaintext means a DB read (SQL injection, backup leak, insider access)
 *   directly yields a chargeable token. AES-256-GCM provides authenticated encryption:
 *   the ciphertext is useless without the key AND the auth tag prevents silent tampering.
 *
 * Where decryption is used:
 *   Only in the monthly renewal cron / manual charge flow, immediately before calling
 *   the CardCom recurring-charge API. The decrypted value must never be logged, returned
 *   in API responses, or stored anywhere outside the scope of that call.
 *
 * The key is intentionally separate from SHAAM_TOKEN_ENC_KEY_B64 so that a compromise
 * in one subsystem does not expose tokens in the other.
 *
 * Key format: base64-encoded 32-byte value (256 bits).
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 128-bit random IV, unique per encryption
const AUTH_TAG_LENGTH = 16; // 128-bit GCM authentication tag
const KEY_LENGTH = 32;      // 256-bit key

function getKey(): Buffer {
  const raw = process.env.BILLING_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'BILLING_TOKEN_ENCRYPTION_KEY environment variable is not set. ' +
        'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `BILLING_TOKEN_ENCRYPTION_KEY has invalid length: expected ${KEY_LENGTH} bytes, ` +
        `got ${key.length}. Provide a base64-encoded 32-byte value.`,
    );
  }
  return key;
}

/**
 * Encrypts a CardCom token for storage in the database.
 * Output format (base64): IV (16 bytes) | AuthTag (16 bytes) | Ciphertext
 * Never log the input or output of this function.
 */
export function encryptCardcomToken(token: string): string {
  if (!token) throw new Error('CardCom token cannot be empty');

  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv) as crypto.CipherGCM;

  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts a stored CardCom token for use in the recurring-charge flow only.
 * Call this only immediately before passing the token to the CardCom charge API.
 * Never log the return value of this function.
 */
export function decryptCardcomToken(encryptedToken: string): string {
  if (!encryptedToken) throw new Error('Encrypted CardCom token cannot be empty');

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
      throw new Error('CardCom token decryption failed: authentication tag mismatch');
    }
    throw new Error(`CardCom token decryption failed: ${err.message}`);
  }
}
