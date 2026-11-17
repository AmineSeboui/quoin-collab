# Changelog

Both packages are released together under one version, so a tag names the state of the whole wire: a
client and a server from the same release always understand each other. Newest first.

## Unreleased

### Added
- Comment-only access. A token with `readOnly: true` and `canComment: true` opens a connection that can add and
  manage its own comments and change nothing else: it may start threads and reply as its `subject`, resolve,
  reopen or delete the threads it started, and add or remove the highlight on their text. A `canComment`
  without `readOnly` stays a writer, and every existing token and option behaves as in 0.2.1. The rule matches
  `quoin-editor` 2.5's `yjsCommentThreads` store. A new comment's `createdAt` must be a date as `toISOString`
  writes it, and a thread is never started under an id the room has held. A comment token without a `subject`
  is served as a reader. `tokenAuthorize` and the standalone server pass `subject` and `canComment` on.
- A commenter's update is judged by its effect on a scratch copy of the room, so only commenter connections
  pay for it. A refused live update gets a denied frame with reason `refused` and the socket closes with 4403;
  a refused sync step 2 is ignored and the connection kept. The meter records `update.refused` and `/metrics`
  exposes `quoin_updates_refused_total`.
- A new frame, type 4, sent only on a comment connection before the server's sync step 1. It carries a fresh
  client id, and the commenter may write only under it. `quoin-collab-client` adopts it, so `doc.clientID`
  changes after connect; a cursor plugin comparing awareness ids with the document's id should know. A 0.2
  client or a y-websocket client holding a comment token ignores the frame and is refused.
- `commentField` on `createCollabServer`, and `QUOIN_COLLAB_COMMENT_FIELD` for the standalone server, name the
  field the editor's comment store uses; it defaults to `comment`, and an empty name means the default.
- `maxCommentUpdateBytes` on `createCollabServer`, and `QUOIN_COLLAB_MAX_COMMENT_UPDATE_BYTES` for the
  standalone server, bound a commenter's update, 65536 bytes by default. A larger one is refused like any other.
- `CollabProvider` stops reconnecting and emits `denied` when an update is refused. It does the same when, on
  reconnecting, its answer to the server's sync step 1 carries a change under a client id an earlier connection
  was assigned: a comment sent on a socket that died without a close, which the server can no longer take.

### Changed
- `CollabProvider` holds every local change until the server's first frame on a connection. A change made in
  that first round trip now travels in the sync step 2 that answers the server's step 1, rather than as an
  update of its own the moment it is made, and a writer's reaches the room there.

## 0.2.1 (2026-11-15)

### Changed
- Both packages are published through npm trusted publishing. The release job proves to npm, through GitHub's
  OIDC, that it is this repository's release workflow, rather than holding a long-lived token. Nothing in
  either package changed: this release exists to publish through the new path, which a token-free release
  is the only way to check.

## 0.2.0 (2026-11-12)

### Changed
- `quoin-collab-protocol` is no longer a package of its own. Its frames ship inside `quoin-collab-server`
  and `quoin-collab-client`, the same files in each, and a test fails if the two copies ever differ.
  Neither package's exports change, so upgrading either is a version bump and nothing else. Code that
  imported `quoin-collab-protocol` itself can stay on 0.1.1, which remains on npm.

### Fixed
- `docker build` works again. Since 0.1.0 the image's build stage stopped at "Could not resolve
  quoin-collab-protocol", because nothing built the protocol before bundling the server. With the protocol
  inside the server there is no separate step left to forget.

### Added
- The image carries `THIRD_PARTY_NOTICES.md` beside `LICENSE`, for the copies of Yjs, y-protocols and lib0
  its bundled server holds.
- A security policy: which versions get fixes, and how to report a problem privately.

## 0.1.1 (2026-11-11)

### Fixed
- `CollabProvider` starts its reconnect delay again when a connection has synced, rather than when the
  socket opened. A server that accepts a socket and drops it before syncing was retried every 150
  milliseconds for as long as it kept doing so; now it is backed off like any other failure, while the
  close a serverless function's time limit causes still costs 75 to 150 milliseconds, because that
  connection synced. y-websocket's provider has drawn the line in the same place for some time and was
  right to.

### Changed
- The reason given for this client existing is the token it refreshes on every connect, and its size,
  rather than its reconnect. Both providers handle a function's time limit, and within milliseconds of
  each other. The README said otherwise and was wrong.

## 0.1.0 (2026-11-11)

### Added
- `quoin-collab-protocol`, the frames both ends read and write, which are y-websocket's.
- `quoin-collab-server`: rooms, presence, Postgres persistence, Redis fanout, signed room tokens,
  Prometheus metrics, and a standalone server behind `npx quoin-collab-server`.
- `quoin-collab-client`: one socket to one room, with awareness.

First release. The three had lived inside a private repository since 2026-11-06, which is why their
history starts before this date.
