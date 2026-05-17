import crypto from 'node:crypto';

export function generateReplyToken(): string {
  return crypto.randomBytes(9).toString('base64url');
}
