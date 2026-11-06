import { createHmac, timingSafeEqual } from 'node:crypto';

export type RoomClaims = {
  room: string;
  /** Seconds since the epoch, as `exp` is everywhere else. */
  exp: number;
  readOnly?: boolean;
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

/** The claims when the token is intact, current and for this room; null for anything else. */
export function verifyRoomToken(token: string, room: string, secret: string): RoomClaims | null {
  const [body, signature] = token.split('.');
  if (body === undefined || signature === undefined) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString()) as RoomClaims;
    if (claims.room !== room) return null;
    if (claims.exp * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Accepts a connection when it carries a token this secret signed for the room it asked for. */
export const tokenAuthorize =
  (secret: string) =>
  ({ room, token }: { room: string; token: string | null }) => {
    if (token === null) return null;
    const claims = verifyRoomToken(token, room, secret);
    return claims === null ? null : { readOnly: claims.readOnly === true };
  };
