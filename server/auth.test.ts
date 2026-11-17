import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  signSessionToken,
  validateSignupInput,
  verifyPassword,
  verifySessionToken,
} from './auth';

test('scrypt password hashing and verification works and rejects wrong passwords', () => {
  const hash = hashPassword('CareSignal2026!');
  assert.ok(hash.includes(':'));
  assert.equal(verifyPassword('CareSignal2026!', hash), true);
  assert.equal(verifyPassword('WrongPassword', hash), false);
});

test('session token signing and verification rejects tampered tokens', () => {
  const token = signSessionToken('user-123');
  const verified = verifySessionToken(token);
  assert.deepEqual(verified, { userId: 'user-123' });

  const tampered = `${token}x`;
  assert.equal(verifySessionToken(tampered), null);
});

test('validateSignupInput validates email and minimum password length', () => {
  const bad = validateSignupInput({ name: 'Jo', email: 'not-an-email', password: '123' });
  assert.equal(bad.valid, false);

  const good = validateSignupInput({
    name: 'Samira Lee',
    email: 'SAMIRA@CLINIC.DEMO',
    password: 'StrongPassword99!',
    role: 'Clinic Staff',
  });
  assert.equal(good.valid, true);
  if (good.valid) {
    assert.equal(good.data.email, 'samira@clinic.demo');
  }
});
