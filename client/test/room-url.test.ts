import { describe, expect, it } from 'vitest';
import { roomUrl } from '../src/room-url.ts';

describe('the socket URL for a room', () => {
  it('appends the room to an absolute base', () => {
    expect(roomUrl('wss://quoin.cloud/collab', 'notes', null)).toBe('wss://quoin.cloud/collab/notes');
  });

  it('turns https into wss', () => {
    expect(roomUrl('https://quoin.cloud/api/collab', 'notes', null)).toBe('wss://quoin.cloud/api/collab/notes');
  });

  it('resolves a path against the page it is served from', () => {
    expect(roomUrl('/api/collab', 'notes', null, 'https://play.quoin.dev/room/x')).toBe(
      'wss://play.quoin.dev/api/collab/notes',
    );
  });

  it('escapes a room name that would otherwise change the path', () => {
    expect(roomUrl('wss://quoin.cloud/collab', 'a/../b', null)).toBe('wss://quoin.cloud/collab/a%2F..%2Fb');
  });

  it('carries the token as a query parameter', () => {
    expect(roomUrl('wss://quoin.cloud/collab', 'notes', 'abc.def')).toBe('wss://quoin.cloud/collab/notes?token=abc.def');
  });

  it('ignores a trailing slash on the base', () => {
    expect(roomUrl('wss://quoin.cloud/collab/', 'notes', null)).toBe('wss://quoin.cloud/collab/notes');
  });
});
