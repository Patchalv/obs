import { describe, expect, it } from 'vitest';
import { clientIp } from './client-ip';

describe('clientIp', () => {
  it('reads Fly-Client-IP, which Fly sets and clients cannot', () => {
    expect(clientIp(new Headers({ 'fly-client-ip': '203.0.113.7' }))).toBe('203.0.113.7');
  });

  it('ignores X-Forwarded-For, which any client can send', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '198.51.100.1' }))).toBeNull();
  });

  it('is null with no headers', () => {
    expect(clientIp(undefined)).toBeNull();
  });

  it('rejects a value that is not an IP address', () => {
    expect(clientIp(new Headers({ 'fly-client-ip': 'someone@example.com' }))).toBeNull();
  });

  it('accepts IPv6', () => {
    expect(clientIp(new Headers({ 'fly-client-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });
});
