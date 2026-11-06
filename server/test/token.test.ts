import { describe, expect, it } from 'vitest';
import { signRoomToken, tokenAuthorize, verifyRoomToken } from '../src/token.ts';

const secret = 'a-shared-secret';
const soon = () => Math.floor(Date.now() / 1000) + 60;

describe('a room token', () => {
  it('verifies for the room it names', () => {
    const token = signRoomToken({ room: 'notes', exp: soon() }, secret);
    expect(verifyRoomToken(token, 'notes', secret)?.room).toBe('notes');
  });

  it('does not verify for another room', () => {
    const token = signRoomToken({ room: 'notes', exp: soon() }, secret);
    expect(verifyRoomToken(token, 'payroll', secret)).toBeNull();
  });

  it('does not verify under another secret', () => {
    const token = signRoomToken({ room: 'notes', exp: soon() }, secret);
    expect(verifyRoomToken(token, 'notes', 'a-different-secret')).toBeNull();
  });

  it('does not verify once it has expired', () => {
    const token = signRoomToken({ room: 'notes', exp: Math.floor(Date.now() / 1000) - 1 }, secret);
    expect(verifyRoomToken(token, 'notes', secret)).toBeNull();
  });

  it('does not verify when its claims were edited', () => {
    const token = signRoomToken({ room: 'notes', exp: soon(), readOnly: true }, secret);
    const [, signature] = token.split('.');
    const forged = `${Buffer.from(JSON.stringify({ room: 'notes', exp: soon() })).toString('base64url')}.${signature}`;
    expect(verifyRoomToken(forged, 'notes', secret)).toBeNull();
  });

  it('survives a malformed token without throwing', () => {
    for (const bad of ['', '.', 'nonsense', 'a.b.c', 'eyJ.z']) {
      expect(verifyRoomToken(bad, 'notes', secret)).toBeNull();
    }
  });

  it('carries read-only through to the authorizer', () => {
    const authorize = tokenAuthorize(secret);
    const reader = signRoomToken({ room: 'notes', exp: soon(), readOnly: true }, secret);
    const writer = signRoomToken({ room: 'notes', exp: soon() }, secret);
    expect(authorize({ room: 'notes', token: reader })).toEqual({ readOnly: true });
    expect(authorize({ room: 'notes', token: writer })).toEqual({ readOnly: false });
    expect(authorize({ room: 'notes', token: null })).toBeNull();
  });
});
