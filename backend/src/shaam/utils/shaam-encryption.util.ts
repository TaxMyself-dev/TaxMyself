import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Gets the encryption key from environment variable
 * @returns Buffer containing the 32-byte AES-256 key
 */
function getEncryptionKey(): Buffer {
  const keyB64 = process.env.SHAAM_TOKEN_ENC_KEY_B64;
  if (!keyB64) {
    throw new Error(
      'SHAAM_TOKEN_ENC_KEY_B64 environment variable is not set. ' +
      'Please add it to your .env file.'
    );
  }

  try {
    const key = Buffer.from(keyB64, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}. ` +
        'The key must be a base64-encoded 32-byte value for AES-256.'
      );
    }
    return key;
  } catch (error: any) {
    throw new Error(
      `Failed to decode SHAAM_TOKEN_ENC_KEY_B64: ${error.message}. ` +
      'Ensure it is a valid base64-encoded string.'
    );
  }
}

/**
 * Encrypts a token using AES-256-GCM
 * @param token - The plaintext token to encrypt
 * @returns Base64-encoded string containing: IV + AuthTag + EncryptedData
 */
export function encryptToken(token: string): string {
  if (!token) {
    throw new Error('Token cannot be empty');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  // @ts-ignore - Buffer is compatible with CipherKey in Node.js
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, 'utf8');
  // @ts-ignore - Buffer.concat accepts Buffer arrays
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Combine: IV (16 bytes) + AuthTag (16 bytes) + EncryptedData (variable)
  // @ts-ignore - Buffer.concat accepts Buffer arrays
  const combined = Buffer.concat([iv, authTag, encrypted]);

  // Return as base64 string
  return combined.toString('base64');
}

/**
 * Decrypts an encrypted token
 * @param encryptedToken - Base64-encoded string containing: IV + AuthTag + EncryptedData
 * @returns The decrypted plaintext token
 */
export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) {
    throw new Error('Encrypted token cannot be empty');
  }

  const key = getEncryptionKey();

  try {
    // Decode from base64
    const combined = Buffer.from(encryptedToken, 'base64');

    // Extract components
    if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Invalid encrypted token format: too short');
    }

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    // Decrypt
    // @ts-ignore - Buffer is compatible with CipherKey in Node.js
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    // @ts-ignore - Buffer is compatible with setAuthTag
    decipher.setAuthTag(authTag);

    // @ts-ignore - Buffer is compatible with update parameter
    let decrypted = decipher.update(encrypted);
    // @ts-ignore - Buffer.concat accepts Buffer arrays
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error: any) {
    if (error.message.includes('Unsupported state')) {
      throw new Error('Decryption failed: invalid encrypted token format');
    }
    if (error.message.includes('bad decrypt')) {
      throw new Error('Decryption failed: authentication tag verification failed');
    }
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

