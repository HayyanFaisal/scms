import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export async function hashPassword(password, { allowLegacyLength = false } = {}) {
  if (typeof password !== 'string' || (!allowLegacyLength && password.length < 12)) {
    throw new Error('Password must be at least 12 characters long');
  }

  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  });

  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    Buffer.from(derived).toString('base64url')
  ].join('$');
}

export async function verifyPassword(password, encodedHash) {
  try {
    const [algorithm, nValue, rValue, pValue, saltValue, hashValue] = String(encodedHash).split('$');
    if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;

    const expected = Buffer.from(hashValue, 'base64url');
    const actual = await scryptAsync(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(nValue),
      r: Number(rValue),
      p: Number(pValue),
      maxmem: 64 * 1024 * 1024
    });

    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function parseCookies(headerValue = '') {
  return String(headerValue)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return cookies;
      const name = decodeURIComponent(part.slice(0, separator));
      const value = decodeURIComponent(part.slice(separator + 1));
      cookies[name] = value;
      return cookies;
    }, {});
}

export function sessionCookie(value, { maxAgeSeconds, secure = false } = {}) {
  const attributes = [
    `scms_session=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict'
  ];

  if (Number.isFinite(maxAgeSeconds)) attributes.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}
