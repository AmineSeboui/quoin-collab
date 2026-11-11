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
