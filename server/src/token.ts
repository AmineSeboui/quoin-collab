import { createHmac, timingSafeEqual } from 'node:crypto';

export type RoomClaims = {
  room: string;
  /** Seconds since the epoch, as `exp` is everywhere else. */
  exp: number;
  readOnly?: boolean;
  /** Which tenant the room belongs to, for a deployment serving more than one. */
  project?: string;
};

const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (body: string, secret: string): string => createHmac('sha256', secret).update(body).digest('base64url');

/**
 * A room token your own application mints after it has decided who the reader is. The server verifies it without
 * reaching back to you, so authentication stays in your system and this server never learns about your users.
 */
export function signRoomToken(claims: RoomClaims, secret: string): string {
  const body = encode(claims);
  return `${body}.${sign(body, secret)}`;
}

/**
 * The claims WITHOUT checking the signature, so nothing here may be trusted. It exists for one reason: a server
 * holding a secret per tenant has to know which tenant a token names before it can look up the secret that
 * would verify it. Use it to find the secret, then `verifyRoomToken` to decide anything.
 */
export function readUnverifiedClaims(token: string): RoomClaims | null {
  const [body] = token.split('.');
  if (body === undefined) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as RoomClaims;
    return typeof claims?.room === 'string' && typeof claims.exp === 'number' ? claims : null;
  } catch {
    return null;
  }
}

/** The claims when the token is intact, current and for this room; null for anything else. */
export function verifyRoomToken(token: string, room: string, secret: string): RoomClaims | null {
  const [body, signature] = token.split('.');
  if (body === undefined || signature === undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const claims = readUnverifiedClaims(token);
  if (claims === null || claims.room !== room) return null;
  return claims.exp * 1000 > Date.now() ? claims : null;
}

/**
 * The claims when any of these secrets signs the token, which is how a rotation keeps working: the previous
 * secret stays in the list for a grace period so nobody is signed out mid sentence.
 */
export function verifyWithAny(token: string, room: string, secrets: readonly string[]): RoomClaims | null {
  for (const secret of secrets) {
    const claims = verifyRoomToken(token, room, secret);
    if (claims !== null) return claims;
  }
  return null;
}

/** Accepts a connection when it carries a token this secret signed for the room it asked for. */
export const tokenAuthorize =
  (secret: string) =>
  ({ room, token }: { room: string; token: string | null }) => {
    if (token === null) return null;
    const claims = verifyRoomToken(token, room, secret);
    return claims === null ? null : { readOnly: claims.readOnly === true };
  };
