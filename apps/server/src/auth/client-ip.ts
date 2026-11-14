import { isIP } from 'node:net';

/**
 * Request headers that carry the client's IP. Only ones the hosting proxy sets and
 * overwrites are trusted: Fly sets Fly-Client-IP. X-Forwarded-For is left out, because
 * any client can send it. Better Auth's rate limiter keys on the same list.
 */
export const CLIENT_IP_HEADERS = ['fly-client-ip'];

/** The request's client IP, or null when no trusted header carries a valid one. */
export function clientIp(headers: Headers | undefined): string | null {
  for (const name of CLIENT_IP_HEADERS) {
    const value = headers?.get(name)?.trim();
    if (value && isIP(value)) return value;
  }
  return null;
}
