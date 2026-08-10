import crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the recommended size for GCM
const KEY_LENGTH = 32; // 256-bit key
const ENCODING = 'hex';

/**
 * Reversible encryption for the ehr-bridge partner secrets sentinel now has
 * to hold on facilities' behalf (see facility_ehr_identities) — HMAC
 * verification needs the plaintext back, so hashing isn't an option, same
 * as ehr-bridge's own CryptoUtil (src/common/crypto.util.ts in that repo),
 * which this mirrors exactly. Reuses ADMIN_SECRET_ENCRYPTION_KEY —
 * already set in sentinel-stack's docker-compose.yml for ehr-bridge, and
 * available process-wide since both run in the same composed process.
 */
export class CryptoUtil {
  private static getKey(): Buffer {
    const raw = process.env.ADMIN_SECRET_ENCRYPTION_KEY;

    if (!raw) {
      throw new Error(
        'ADMIN_SECRET_ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32',
      );
    }

    const key = Buffer.from(raw, ENCODING);

    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `ADMIN_SECRET_ENCRYPTION_KEY must be ${KEY_LENGTH} bytes ` +
          `(${KEY_LENGTH * 2} hex characters), received ${key.length} bytes`,
      );
    }

    return key;
  }

  /** @returns `iv:authTag:ciphertext`, all hex-encoded */
  static encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);

    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);

    return [
      iv.toString(ENCODING),
      cipher.getAuthTag().toString(ENCODING),
      ciphertext.toString(ENCODING),
    ].join(':');
  }

  static decrypt(encrypted: string): string {
    const parts = encrypted.split(':');

    if (parts.length !== 3) {
      throw new Error('Malformed ciphertext: expected iv:authTag:ciphertext');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.getKey(),
      Buffer.from(ivHex, ENCODING),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, ENCODING));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, ENCODING)),
      decipher.final(),
    ]).toString('utf-8');
  }

  static safeEqual(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    if (bufferA.length !== bufferB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
  }
}
