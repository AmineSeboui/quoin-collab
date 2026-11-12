# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | Yes: security fixes are released as 0.2.x patches |
| 0.1.x | No: 0.2.0 changes nothing either package exports, so upgrade instead |

Both packages are released together under one version, so a fix ships as the same patch across
`quoin-collab-server` and `quoin-collab-client`. `quoin-collab-protocol` was folded into both in 0.2.0 and
gets no further releases.

## Reporting a vulnerability

Please do not open a public issue, pull request or discussion for a security problem.

Report it privately through GitHub's private vulnerability reporting: open
[a new security advisory](https://github.com/AmineSeboui/quoin-collab/security/advisories/new) from the
Security tab of this repository. Describe the problem, the version it affects, and the steps that reproduce
it, and, if you can, what an attacker could do with it.

You can expect an acknowledgement within a week. Once the problem is confirmed, a fix is prepared in the
private advisory, released as a patch, and the advisory published with credit to you unless you would rather
not be named.

## What is in scope

This server stands between browsers and documents, and the only thing deciding who may open a room is a
token your application signed. Reports that matter most are ones where somebody reaches a document they were
not given, or stops others reaching theirs:

- **Tokens.** A signature accepted that was not made with the secret, a claim honoured that was not signed,
  an expiry not enforced, or a token minted for one room opening another. The format is an HMAC over
  base64url JSON, verified in `token.ts`.
- **Rooms and tenancy.** A connection reaching a room outside the project its token names, a read-only
  connection writing, or one room's state reaching another through persistence or through the broker.
- **The broker.** A message accepted from a publisher that should not be able to reach this deployment, or
  one room's updates delivered to another, in `fanout/`.
- **Persistence.** Anything that lets a room's stored state be read or written through another room's name,
  in `persistence/`.
- **The metrics endpoint**, which must answer only to a request carrying `QUOIN_COLLAB_METRICS_TOKEN` when
  that variable is set, and must not be served at all when it is not.

## What is out of scope

- **Your own authorization.** This server never asks who your users are; it checks a token you signed. If
  your application signs a token for the wrong reader, that is your decision and this server will honour it.
- **A leaked secret.** Anybody holding `QUOIN_COLLAB_SECRET` can mint a token for any room, by design. Keep
  it on your server.
- **Volume.** This accepts the connections it is given. Rate limiting, connection caps and the rest belong
  in whatever stands in front of it, and a report that many connections exhaust memory is a capacity
  question rather than a vulnerability.
- **Clients and stores you pass in.** The Postgres and Redis clients, the `authorize` function and the meter
  are your code, trusted as your code. A problem that needs a malicious one of those is out of scope unless
  this server documents that it checks what it gets back.
- **Yjs itself**, which should go to [yjs](https://github.com/yjs/yjs), and the y-websocket protocol as a
  design, which this implements rather than defines.
