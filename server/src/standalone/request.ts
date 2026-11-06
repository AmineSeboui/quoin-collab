import type { IncomingMessage } from 'node:http';
import type { ConnectionRequest } from '../auth.ts';

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** The room a socket asked for, taken from the path as y-websocket takes it: `wss://host/<room>`. */
export function describeRequest(request: IncomingMessage): ConnectionRequest | null {
  const url = new URL(request.url ?? '/', 'http://quoin.invalid');
  const room = decodeURIComponent(url.pathname.replace(/^\/+/, '').replace(/\/+$/, ''));
  if (room === '' || room.length > 200) return null;
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) headers[key] = first(value);
  return { room, token: url.searchParams.get('token'), headers };
}
