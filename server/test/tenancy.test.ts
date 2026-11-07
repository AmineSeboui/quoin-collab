import { describe, expect, it, vi } from 'vitest';
import { CollabProvider } from 'quoin-collab-client';
import { createCollabServer } from '../src/server.ts';
import { tenantAuthorize } from '../src/tenancy.ts';
import { signRoomToken } from '../src/token.ts';
import { socketsTo } from './fake-socket.ts';
import { settle } from './settle.ts';

const soon = () => Math.floor(Date.now() / 1000) + 60;
const ACME = 'acme-project-id';
const OTHER = 'other-project-id';
const SECRETS: Record<string, string[]> = { [ACME]: ['acme-secret'], [OTHER]: ['other-secret'] };
const lookup = (project: string) => (SECRETS[project] ? { secrets: SECRETS[project]! } : null);

const ask = (token: string | null, room = 'notes') =>
  tenantAuthorize({ lookup })({ room, token, headers: {} });

describe('a multi-tenant connection', () => {
  it('opens a room namespaced to the project in its token', async () => {
    const token = signRoomToken({ room: 'notes', exp: soon(), project: ACME }, 'acme-secret');
    await expect(ask(token)).resolves.toEqual({ readOnly: false, room: `${ACME}/notes` });
  });

  it('refuses a token claiming a project it cannot sign for', async () => {
    const forged = signRoomToken({ room: 'notes', exp: soon(), project: ACME }, 'other-secret');
    await expect(ask(forged)).resolves.toBeNull();
  });

  it('refuses a token naming a project nobody has', async () => {
    const token = signRoomToken({ room: 'notes', exp: soon(), project: 'no-such-project' }, 'acme-secret');
    await expect(ask(token)).resolves.toBeNull();
  });

  it('refuses a token with no project at all', async () => {
    await expect(ask(signRoomToken({ room: 'notes', exp: soon() }, 'acme-secret'))).resolves.toBeNull();
  });

  it('refuses a token minted for another room', async () => {
    const token = signRoomToken({ room: 'payroll', exp: soon(), project: ACME }, 'acme-secret');
    await expect(ask(token, 'notes')).resolves.toBeNull();
  });

  it('refuses an expired token', async () => {
    const stale = Math.floor(Date.now() / 1000) - 1;
    await expect(ask(signRoomToken({ room: 'notes', exp: stale, project: ACME }, 'acme-secret'))).resolves.toBeNull();
  });

  it('refuses a connection carrying no token', async () => {
    await expect(ask(null)).resolves.toBeNull();
  });

  it('carries read-only through', async () => {
    const token = signRoomToken({ room: 'notes', exp: soon(), readOnly: true, project: ACME }, 'acme-secret');
    await expect(ask(token)).resolves.toEqual({ readOnly: true, room: `${ACME}/notes` });
  });
});

describe('a rotation', () => {
  it('keeps honouring the previous secret while it is still listed', async () => {
    const authorize = tenantAuthorize({ lookup: () => ({ secrets: ['new-secret', 'old-secret'] }) });
    const signedWithOld = signRoomToken({ room: 'notes', exp: soon(), project: ACME }, 'old-secret');
    await expect(authorize({ room: 'notes', token: signedWithOld, headers: {} })).resolves.not.toBeNull();
  });

  it('stops honouring it once it is dropped from the list', async () => {
    const authorize = tenantAuthorize({ lookup: () => ({ secrets: ['new-secret'] }) });
    const signedWithOld = signRoomToken({ room: 'notes', exp: soon(), project: ACME }, 'old-secret');
    await expect(authorize({ room: 'notes', token: signedWithOld, headers: {} })).resolves.toBeNull();
  });
});

describe('a lookup that fails', () => {
  it('refuses the connection rather than letting it through', async () => {
    const onError = vi.fn();
    const authorize = tenantAuthorize({
      lookup: () => {
        throw new Error('the database is unreachable');
      },
      onError,
    });
    const token = signRoomToken({ room: 'notes', exp: soon(), project: ACME }, 'acme-secret');

    await expect(authorize({ room: 'notes', token, headers: {} })).resolves.toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('two customers who both call a room notes', () => {
  it('are in two documents, not one', async () => {
    const collab = createCollabServer({ authorize: tenantAuthorize({ lookup }) });
    const token = (project: string, secret: string) =>
      signRoomToken({ room: 'notes', exp: soon(), project }, secret);

    const acme = new CollabProvider({
      url: 'wss://quoin.test/c',
      room: 'notes',
      token: token(ACME, 'acme-secret'),
      socketFactory: socketsTo(collab, 'notes').factory,
    });
    const other = new CollabProvider({
      url: 'wss://quoin.test/c',
      room: 'notes',
      token: token(OTHER, 'other-secret'),
      socketFactory: socketsTo(collab, 'notes').factory,
    });
    await settle();

    acme.doc.getText('quoin').insert(0, 'acme confidential');
    await settle();

    expect(acme.doc.getText('quoin').toString()).toBe('acme confidential');
    expect(other.doc.getText('quoin').toString()).toBe('');
    expect(collab.stats().rooms).toBe(2);
    await collab.close();
  });

  it('still share a room when they are the same customer', async () => {
    const collab = createCollabServer({ authorize: tenantAuthorize({ lookup }) });
    const token = signRoomToken({ room: 'notes', exp: soon(), project: ACME }, 'acme-secret');
    const one = new CollabProvider({
      url: 'wss://quoin.test/c',
      room: 'notes',
      token,
      socketFactory: socketsTo(collab, 'notes').factory,
    });
    const two = new CollabProvider({
      url: 'wss://quoin.test/c',
      room: 'notes',
      token,
      socketFactory: socketsTo(collab, 'notes').factory,
    });
    await settle();

    one.doc.getText('quoin').insert(0, 'shared within the project');
    await settle();

    expect(two.doc.getText('quoin').toString()).toBe('shared within the project');
    expect(collab.stats().rooms).toBe(1);
    await collab.close();
  });
});
