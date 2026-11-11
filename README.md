# Quoin Collab

The collaboration server behind [Quoin](https://quoincloud.com), the browser provider that talks to it, and
the wire protocol the two of them share. Three packages, all MIT, and none of them a cut-down version of
something else: the hosted service at quoincloud.com runs this code.

| Package | What it is |
| --- | --- |
| [`quoin-collab-server`](packages/server) | Rooms, presence, persistence and fanout. Runs standalone, or inside a server you already have. |
| [`quoin-collab-client`](packages/client) | One socket to one room, with awareness and a reconnect that survives a function's time limit. |
| [`quoin-collab-protocol`](packages/protocol) | The frames both ends read and write. Compatible with y-websocket. |

## Why it is open

A document you cannot move is a document somebody else owns. The wire here is
[y-websocket](https://github.com/yjs/y-websocket)'s protocol, so a client you already have will talk to this
server, and this server is not the only one that can serve your documents. A document exports as the Yjs
state any server would hold and loads back into a plain `Y.Doc` in one call.

That is checked rather than asserted: an unmodified y-websocket client syncs through this server, carries
presence through it and passes its token the same way, and the test that proves it runs on every commit.

No feature of the hosted service is missing from what is here. The moment a dashboard were the only way to do
something, the open half would be a demo and this whole argument would stop being true.

## Run the server

Nothing is required to start. Three environment variables turn it into a production deployment:

```bash
DATABASE_URL=postgres://quoin:secret@localhost:5432/quoin \
QUOIN_COLLAB_SECRET=$(openssl rand -hex 32) \
npx quoin-collab-server
```

| Variable | Without it | With it |
| --- | --- | --- |
| `DATABASE_URL` | Documents live in memory and go when the process does | Documents are kept in Postgres and survive a restart |
| `REDIS_URL` | A change reaches only the clients on this process | A change reaches every process serving the room |
| `QUOIN_COLLAB_SECRET` | Every connection is accepted | Only connections carrying a token you signed |

Set `REDIS_URL` only when you run more than one replica. One process needs no broker, and adding one buys
nothing but a hop. `docker compose up` brings the server, Postgres and Redis up together.

## Connect to it

Your own server decides who the reader is and signs a short lived token saying so:

```ts
import { signRoomToken } from 'quoin-collab-server/token';

const token = signRoomToken(
  { room: documentId, exp: Math.floor(Date.now() / 1000) + 300, readOnly: !canEdit },
  process.env.QUOIN_COLLAB_SECRET,
);
```

The browser opens a provider with it:

```ts
import { CollabProvider } from 'quoin-collab-client';

const provider = new CollabProvider({
  url: 'wss://collab.example.com',
  room: documentId,
  token: () => fetch(`/api/room-token/${documentId}`).then((r) => r.text()),
});
```

Any y-websocket client will do instead, because the protocol is y-websocket's. The provider here is smaller
and reconnects when a serverless function's time limit closes a healthy socket, which is the only reason it
exists.

## Documentation

Self-hosting, the token format, the architecture and the serverless notes are at
[quoincloud.com/docs](https://quoincloud.com/docs). The editor these documents are written in is
[quoin-editor](https://github.com/AmineSeboui/quoin-editor).

If you would rather not operate it, [Quoin Cloud](https://quoincloud.com/pricing) runs this server for you,
with a free tier and no feature held back.

## Working on it

```bash
npm install
npm run check
```

`check` builds the three packages, typechecks them, lints and runs the tests. The server runs from source
with `npm run dev`, no build step, because nothing in it is syntax Node cannot simply erase.

## Licence

MIT. Copyright 2026 Amine Sboui.
