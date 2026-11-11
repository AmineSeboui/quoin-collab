# quoin-collab-client

A browser provider for [Yjs](https://yjs.dev) documents: one WebSocket to one room, awareness, and a
reconnect that treats a closed socket as normal rather than as a failure. MIT.

```bash
npm install quoin-collab-client yjs
```

```ts
import { CollabProvider } from 'quoin-collab-client';

const provider = new CollabProvider({
  url: 'wss://collab.example.com',
  room: 'design-notes',
  token: () => fetch('/api/room-token/design-notes').then((r) => r.text()),
});

provider.on('status', (status) => console.log(status));
provider.on('sync', (synced) => console.log(synced ? 'caught up' : 'behind'));
```

It carries `doc`, `awareness`, `synced` and a `sync` event, so it drops into anything that expects
y-websocket's provider, including [Quoin](https://quoincloud.com)'s collaboration extension. Pass your own
`Y.Doc` or `Awareness` and it will use them; leave them out and it makes them.

`token` may be a string or a function, and the function is called before every connect, so a token that
expires in five minutes is refreshed rather than carried around.

## Why not y-websocket's provider

y-websocket's works. The wire is the same protocol, either end works with either, and the server this talks
to is tested against an unmodified y-websocket client on every commit. If you already have one, that is a
real option and the reason the protocol is theirs rather than ours.

Two differences, and only the first is a reason to choose:

**An expiring token.** `token` may be a function, awaited before every connect, so a token that lives five
minutes is refreshed on each reconnect without you arranging it. y-websocket takes `params` as a plain
object. It is read again on every reconnect, so you can keep a token in it, but nothing fetches one for you
and a reconnect can arrive after the old one expired. With short-lived tokens, which is how this server
expects to be used, that difference is the connection coming back or not.

**Size**, about 32 kB unpacked against 92 kB, because this does one thing.

What is not a difference: both handle the close a serverless function's time limit causes, and within
milliseconds of each other. y-websocket 3 resets its backoff once a connection has synced, so a routine
close costs it about 200 milliseconds against this one's 75 to 150.

The server it talks to is [quoin-collab-server](https://www.npmjs.com/package/quoin-collab-server), and the
source is at [AmineSeboui/quoin-collab](https://github.com/AmineSeboui/quoin-collab).
