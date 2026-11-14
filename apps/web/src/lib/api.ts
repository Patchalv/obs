import type { AppType } from '@ping/server/app-type';
import { hc } from 'hono/client';

// The only way apps/web talks to the server: the typed Hono RPC client.
export const api = hc<AppType>('/');
