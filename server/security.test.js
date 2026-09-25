import assert from 'node:assert/strict';
import test from 'node:test';
import { hashPassword, hashToken, parseCookies, sessionCookie, verifyPassword } from './security.js';

test('password hashes are salted and verify only the original password', async () => {
  const first = await hashPassword('A strong local password 2026!');
  const second = await hashPassword('A strong local password 2026!');

  assert.notEqual(first, second);
  assert.equal(await verifyPassword('A strong local password 2026!', first), true);
  assert.equal(await verifyPassword('incorrect password', first), false);
  assert.equal(await verifyPassword('A strong local password 2026!', 'not-a-valid-hash'), false);
});

test('new passwords enforce length while the migration-only legacy option preserves old credentials', async () => {
  await assert.rejects(() => hashPassword('short'), /at least 12/);
  const migrated = await hashPassword('short', { allowLegacyLength: true });
  assert.equal(await verifyPassword('short', migrated), true);
});

test('session tokens are hashed deterministically without exposing the token', () => {
  const token = 'private-session-token';
  const digest = hashToken(token);

  assert.equal(digest.length, 64);
  assert.equal(digest, hashToken(token));
  assert.equal(digest.includes(token), false);
});

test('cookie helpers create a protected host cookie and parse request cookies', () => {
  const header = sessionCookie('a token', { maxAgeSeconds: 600, secure: true });
  assert.match(header, /^scms_session=a%20token;/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Secure/);

  assert.deepEqual(parseCookies('theme=dark; scms_session=a%20token'), {
    theme: 'dark',
    scms_session: 'a token'
  });
});
