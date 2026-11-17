# Self-hosting

The server needs nothing to start and three things to be production. Each is a single environment variable, and
startup prints which ones it got, so a misconfigured deployment says so in its first four lines of log.

## The three variables

| Variable | Without it | With it |
| --- | --- | --- |
| `DATABASE_URL` | Documents live in memory and go when the process does | Documents are kept in Postgres and survive a restart |
| `REDIS_URL` | A change reaches only the clients on this process | A change reaches every process serving the room |
| `QUOIN_COLLAB_SECRET` | Every connection is accepted | Only connections carrying a token you signed |

`PORT` defaults to 1234 and `HOST` to every interface.

Set `REDIS_URL` only when you run more than one replica. One process needs no broker, and adding one buys
nothing but a hop.

## On a single VPS

One process, one Postgres, no broker, which comfortably serves a few thousand concurrent editors:

```bash
DATABASE_URL=postgres://quoin:secret@localhost:5432/quoin \
QUOIN_COLLAB_SECRET=$(openssl rand -hex 32) \
npx quoin-collab-server
```

The table is created on first start. Put it behind nginx or Caddy for TLS, and allow the upgrade through:

```nginx
location /collab/ {
  proxy_pass http://127.0.0.1:1234/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
}
```

`proxy_read_timeout` matters. A room that nobody types in for a minute still holds an open socket, and the
default of 60 seconds closes it. The client reconnects either way, but a reconnect a minute is noise you can
avoid.

## With Docker

`docker compose up` brings the server, Postgres and Redis up together. Set `QUOIN_COLLAB_SECRET` in the
environment first; the compose file has a placeholder that is deliberately not a secret.

The image is one bundled file on `node:24-alpine`, runs as `node` rather than root, and answers
`GET /health` with the number of rooms and connections it is holding, which is what a load balancer should
watch.

## Behind a load balancer

Sockets for one room do not have to land on one replica, which is the whole reason `REDIS_URL` exists. You do
not need sticky sessions, and turning them on will only make one replica hot.

Scale on connections rather than CPU. A room costs memory for its document and almost no processor time; a
server that is busy is usually a server holding a lot of documents.

## Authentication

Your application decides who may open a room, then signs a token saying so:

```ts
import { signRoomToken } from 'quoin-collab-server/token';

const token = signRoomToken(
  { room: documentId, exp: Math.floor(Date.now() / 1000) + 300, readOnly: !canEdit },
  process.env.QUOIN_COLLAB_SECRET,
);
```

Give the client a function rather than a string, and it fetches a fresh token on every connect, including every
reconnect:

```ts
new CollabProvider({ url, room, token: () => fetch(`/api/token/${room}`).then((r) => r.text()) });
```

Keep `exp` short. The token is checked when a socket opens and not again, so its lifetime is how long a revoked
reader can still open a new connection, not how long they can stay.

## Access levels

The token's claims decide what a connection may do:

| Claims | Access | What the connection may do |
| --- | --- | --- |
| none of the below | Write | Everything. The default. |
| `readOnly: true` | Read | See the document and presence. Every change it sends is dropped silently. |
| `readOnly: true`, `canComment: true` | Comment | Read, and add and manage its own comments. |

`canComment` only narrows a read-only token. Without `readOnly: true` the holder is a writer, as before the
claim existed. A commenter token needs a `subject`, the id of the person it was signed for. It is the author id their comments
must carry, and a comment token without one is served as a reader:

```ts
const token = signRoomToken(
  { room: documentId, exp: Math.floor(Date.now() / 1000) + 300, readOnly: true, canComment: true, subject: userId },
  process.env.QUOIN_COLLAB_SECRET,
);
```

`tokenAuthorize` passes `subject` and `canComment` on, and so does the standalone server.

### What a commenter may change

A commenter adds and manages their own comments and nothing else. They may start a thread whose
`startedBy.id` is their subject, reply to any thread with `author.id` their subject, resolve, reopen or delete
the threads they started (deleting a thread hides its replies, since a reply whose thread is gone is not shown),
and add or remove the highlight on the text of their own threads. They may not insert or delete text, apply any
other formatting, change blocks, add anything new at the top level of the document, or put an `avatarUrl` on
`startedBy` or `author`. A new thread or reply carries its `createdAt` as `new Date().toISOString()` writes it, and
a thread is never started under an id the document has held before, so a deleted thread stays deleted.

A new thread or reply must also be dated within 10 minutes of the server's clock, before or after, so a commenter
cannot slip a reply between two others or pin one to the top by dating it. `commentClockSkewMs` on
`createCollabServer`, or `QUOIN_COLLAB_COMMENT_CLOCK_SKEW_MS` for the standalone server, sets another window in
milliseconds; an empty or non-positive value means the default. A guest whose device clock is off by more than the
window is refused when they comment. Resolving a thread keeps its stored `createdAt`, so an old thread can still be
resolved.

The rule matches the comment store of `quoin-editor` 2.5, `yjsCommentThreads`, which keeps its threads and
replies in the maps `<field>-threads` and `<field>-replies`, with `field` defaulting to `comment`. If your editor
sets another `field`, tell the server the same name: the `commentField` option of `createCollabServer`, or the
`QUOIN_COLLAB_COMMENT_FIELD` environment variable for the standalone server. The token's `subject` must equal
the author id your editor writes, or the server refuses the first change.

A commenter's update is refused when it is larger than 65536 bytes, which no comment the editor writes comes near.
`maxCommentUpdateBytes` on `createCollabServer`, or `QUOIN_COLLAB_MAX_COMMENT_UPDATE_BYTES` for the standalone
server, sets another bound. A writer's updates are bounded only by the socket: the standalone server's takes
frames of up to 100 MiB, ws's default.

### When a change is refused

A commenter update outside the rule, or over the bound, gets a denied frame with reason `refused`, and the
socket closes with code 4403 and reason `refused`. `CollabProvider` stops reconnecting and emits `denied`. A
refused sync step 2, which is what a reconnecting client sends to catch the room up, is ignored and the
connection stays. The meter records `update.refused`, with origin `handshake` or `live`, and `/metrics` counts
them as `quoin_updates_refused_total`.

### Offering comments in your interface

Comment-only connections need `quoin-collab-client` 0.3. A 0.2 client, or a y-websocket client holding a
comment token, never learns the client id the server assigned and is refused on its first change.

Offer commenting only while the provider is synced. A comment made before the id arrives never reaches the room,
and acting on it later, such as highlighting text for a thread the room never got, closes the session with 4403.
A comment sent on a socket that died without a close is caught when the provider reconnects: it emits `denied`
with reason `refused` and stops, as it does for a refused change. Either way a host should offer a reload when it
sees `denied` with reason `refused`. Each commenter connection that writes adds one entry to the document's state
vector.

Bind `quoin-editor` after the provider's first sync, or pass `seed: false` to `yjsCollaboration`. A seed written
before the id arrives is refused, and leaves the commenter with a block nobody else has.

## Watching it

`GET /health` answers with the rooms and connections this process is serving, which is what a load balancer
needs. For anything more, pass a metrics meter and the standalone server serves `GET /metrics` in the format
Prometheus reads:

```ts
import { createCollabServer, metricsMeter, startStandalone } from 'quoin-collab-server';

const metrics = metricsMeter();
const collab = createCollabServer({ persistence, fanout, meter: metrics });
await startStandalone({ collab, port: 1234, metrics });
```

Without the `metrics` option that path is an ordinary room name, which is the right default: these numbers
belong on a network you chose rather than on whatever this port is reachable from. Put it behind your proxy,
or run a second listener for it.

A meter is a single option, so if you already pass one of your own for billing or for a dashboard,
`bothMeters(yours, metrics)` feeds both from the same events rather than making you choose between them.

The counter worth setting an alarm on is `quoin_fanout_received_total`. Two processes that cannot reach each
other both report healthy, both report connections, and both serve a room that reads perfectly well to the
person in it. Nothing else distinguishes that from a quiet afternoon: published climbing while received stays
at zero is the only thing that says the broker has stopped carrying anything.

`quoin_persistence_failures_total` is the other one. Storage failures are reported to `onError` and otherwise
go nowhere a dashboard can see, and a room that cannot be written is a room whose last few minutes of typing
are waiting to be lost.

## Backups

The documents table holds one row per room, each a merged Yjs state. An ordinary `pg_dump` is a complete
backup, and restoring one gives every room back as it was.
