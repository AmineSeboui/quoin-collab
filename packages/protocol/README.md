# quoin-collab-protocol

The frames [quoin-collab-server](https://www.npmjs.com/package/quoin-collab-server) and
[quoin-collab-client](https://www.npmjs.com/package/quoin-collab-client) read and write, kept in one package
so neither end can drift from the other. MIT.

It is [y-websocket](https://github.com/yjs/y-websocket)'s message layout: a varint message type, then the
body that `y-protocols` encodes. Message types 0 and 1 are sync and awareness exactly as y-websocket writes
them, which is why an unmodified y-websocket client syncs through this server.

```ts
import { readFrame, MESSAGE_SYNC } from 'quoin-collab-protocol';

const frame = readFrame(bytes);
if (frame.type === MESSAGE_SYNC) {
  // frame.decoder is positioned at the body y-protocols expects
}
```

The one addition is a refusal frame, so a server that turns a connection away can say why instead of closing
the socket and leaving the client to guess.

You will not normally install this yourself: the server and the client both depend on it. It is published
separately so that a third implementation of either end has something to read.
