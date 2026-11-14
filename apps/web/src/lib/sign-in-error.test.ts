import { describe, expect, it } from 'vitest';
import { signInErrorMessage } from './sign-in-error';

describe('signInErrorMessage', () => {
  it('says the email or password is wrong, without saying which', () => {
    expect(signInErrorMessage({ status: 401 })).toBe('That email and password don’t match.');
  });

  it('tells a Deactivated Staff member to ask an Admin', () => {
    expect(signInErrorMessage({ status: 403, code: 'STAFF_MEMBER_DEACTIVATED' })).toBe(
      'This account can’t sign in. Ask a Ping Admin.',
    );
  });

  it('asks the person to wait after too many attempts', () => {
    expect(signInErrorMessage({ status: 429 })).toBe(
      'Too many attempts. Wait a minute, then try again.',
    );
  });

  it('falls back to a general message', () => {
    expect(signInErrorMessage({ status: 500 })).toBe('Something went wrong. Try again.');
  });
});
