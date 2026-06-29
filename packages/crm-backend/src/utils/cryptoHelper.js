const crypto = require('node:crypto');

/**
 * Generates a cryptographically secure random token string.
 * The raw token is sent via email; only the hashed version is stored in the DB.
 */
const generateRawToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

/**
 * SHA-256 hashes a token string for safe database storage.
 */
const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

/**
 * AES-256-CBC encrypt — only used when ENCRYPT_DB_CREDENTIALS=true.
 * The key must be a 32-byte hex string (64 hex chars).
 */
const encryptText = (plaintext, hexKey) => {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * AES-256-CBC decrypt — matches encryptText above.
 */
const decryptText = (ciphertext, hexKey) => {
  const [ivHex, encryptedHex] = ciphertext.split(':');
  const key = Buffer.from(hexKey, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
};

module.exports = { generateRawToken, hashToken, encryptText, decryptText };
