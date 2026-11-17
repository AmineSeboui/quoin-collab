import * as Y from 'yjs';
import { CollabProvider } from 'quoin-collab-client';
import type { Authorization } from '../../src/auth.ts';
import { createCollabServer, type CollabServer, type CollabServerOptions } from '../../src/server.ts';
import { guest, replyTo, type User } from '../comments/store.ts';
import { socketsTo, type FakeSocket } from '../fake-socket.ts';
import { peer, type Peer } from '../peer.ts';
import { settle } from '../settle.ts';

export const lin: User = { id: 'guest-2', name: 'Lin' };

const GRANTS: Record<string, Authorization> = {
  writer: {},
  reader: { readOnly: true },
  'reader-grace': { readOnly: true, subject: guest.id },
  guest: { readOnly: true, canComment: true, subject: guest.id },
  lin: { readOnly: true, canComment: true, subject: lin.id },
};

export const serve = (options: CollabServerOptions = {}) =>
  createCollabServer({ ...options, authorize: ({ token }) => GRANTS[token ?? ''] ?? null });

export const textOf = (doc: Y.Doc) => doc.getText('quoin').toString();
export const write = (text: string, at = 0) => (doc: Y.Doc) => doc.getText('quoin').insert(at, text);
export const reply = (id: string, by = guest) => (doc: Y.Doc) => replyTo(doc, 't-1', id, by);

export const REFUSED = ['denied:refused', 'closed:4403:refused'];

/** What the room holds, read by someone who joins after the fact. */
export async function held(collab: CollabServer): Promise<Y.Doc> {
  const reader = await peer(collab, 'notes', 'reader');
  await settle();
  return reader.doc;
}

/** Sends `make` from `attacker` as if it were `victim`, under the victim's client id at its next clock. */
export function forge(attacker: Peer, victim: number, make: (doc: Y.Doc) => void): void {
  attacker.doc.clientID = victim;
  attacker.send(attacker.change(make));
}

/**
 * A client, keeping one document across connections, that can be pointed at another server or handed another token
 * between them. It names its user, as an editor does.
 */
export function commenter(first: CollabServer, token = 'guest') {
  const at = { collab: first, token };
  const denied: string[] = [];
  const sockets: FakeSocket[] = [];
  const provider = new CollabProvider({
    url: 'wss://quoin.test/c',
    room: 'notes',
    token: () => at.token,
    socketFactory: (url) => {
      const to = socketsTo(at.collab, 'notes');
      const socket = to.factory(url);
      sockets.push(...to.opened);
      return socket;
    },
  });
  provider.on('denied', (reason) => denied.push(reason));
  provider.awareness.setLocalStateField('user', { name: 'Grace' });
  return {
    provider,
    denied,
    /** The socket the provider is on, or was on last. */
    socket: () => sockets.at(-1)!,
    moveTo: (collab: CollabServer) => void (at.collab = collab),
    grant: (next: string) => void (at.token = next),
  };
}
