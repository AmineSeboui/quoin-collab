const SCHEMES: Record<string, string> = { 'http:': 'ws:', 'https:': 'wss:' };

/**
 * Builds the socket URL for a room. The base may be absolute (`wss://host/api/collab`) or a path on this origin
 * (`/api/collab`), which is what a playground served beside its own server wants.
 */
export function roomUrl(base: string, room: string, token: string | null, origin?: string): string {
  const here = origin ?? (typeof location === 'undefined' ? 'http://localhost' : location.href);
  const url = new URL(`${base.replace(/\/+$/, '')}/${encodeURIComponent(room)}`, here);
  url.protocol = SCHEMES[url.protocol] ?? url.protocol;
  // An empty token is no token: a deployment that needs none answers its token route with nothing.
  if (token !== null && token !== '') url.searchParams.set('token', token);
  return url.toString();
}
