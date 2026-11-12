# Architecture

## A keystroke's journey

A character typed in a browser reaches Quoin's engine, which writes it into the Yjs document the editor is
bound to. Yjs turns that into an update, the provider puts a sync frame around it and sends it up the socket.

The server applies the update to its own copy of the document, marked with the connection it arrived on. Yjs
then tells the room what changed, and the room sends it to every other socket it holds, and publishes it to the
broker for whatever other process is serving the same room. Those processes apply it marked as remote, which
stops them publishing it back and starting a loop.

Every client ends with the same document because Yjs is a CRDT: order of arrival does not matter, and neither
does a client that was offline while it happened.

## Why the server holds a document at all

It would be enough to relay bytes. Holding the document buys three things. A client that joins late is brought
up to date by the server rather than by another client, so a room with one person in it still opens correctly.
A room can be written to Postgres and read back, which a relay cannot do. And an update that arrives for a
document the server has never seen can still be placed, because Yjs holds what it cannot yet apply.

## The seams

Four things are interfaces rather than decisions, because a laptop and a cluster want different answers:

**Transport.** The core is given something that can `send` and `close`, and hands back something that takes
received frames. A plain `ws` server, a serverless function and a test with no socket at all are all the same
to it.

**Persistence.** `load` a room, `save` a room. In memory by default. Postgres keeps one row per room holding a
merged state, replaced on save rather than appended to, which keeps reads to a single row and needs no
compaction.

**Fanout.** `publish` to a room, `subscribe` to a room. The default reaches nobody, which is correct in one
process. Redis gives a channel per room.

**Authorization.** A function from a connection request to a grant, or null to refuse. It can return
`{ denied: reason }` in place of null, which refuses in exactly the same way but names the step that did it,
for the log rather than for the client. The client is told no more either way. Absent, everything is accepted.

## Room lifetime

A room is opened when the first client asks for it and read from persistence once. Changes are written out a
couple of seconds after they stop, rather than on every keystroke.

When the last client leaves, the room is kept in memory for another thirty seconds, because a reconnect is
common and reading the document again is wasteful. After that it is written out and dropped. The write is
awaited before the room is forgotten, and a client arriving during that write keeps the loaded room rather than
reading a copy that is about to be stale.

## Presence

Awareness is y-protocols' own, carried over the same socket. The server keeps one awareness per room and treats
it like the document: apply, tell the others, publish.

A connection remembers which client ids it introduced. When its socket closes, those ids are removed, so a
caret disappears when its owner does rather than timing out a few seconds later.

## The protocol

y-websocket's, deliberately. Four frame types, the same numbers, the same bodies. That is why either side of
this can be replaced by a y-websocket equivalent, and why an existing Yjs deployment can move to this server
without touching its clients.

The frames live in `src/protocol` in both packages, the same files in each, rather than in a package of their
own that nobody installed on purpose. A test fails the moment the two copies differ, so the server and the
client from one release always agree on the wire.
