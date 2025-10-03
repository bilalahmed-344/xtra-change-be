import * as crypto from 'crypto';

const algorithm = 'aes-256-cbc';

function getKeyFromText(textKey: string): Buffer {
  return crypto.createHash('sha256').update(textKey).digest();
}

const textKey = process.env.ENCRYPT_SECRET;
console.log('🚀 ~ textKey:', textKey);
if (!textKey) {
  throw new Error('ENCRYPT_SECRET is not defined in environment variables');
}
const key = getKeyFromText(textKey);

export function encrypt(data: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(data: string): string {
  const parts = data.split(':');
  const iv_from_data = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = parts.join(':');
  const decipher = crypto.createDecipheriv(algorithm, key, iv_from_data);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
