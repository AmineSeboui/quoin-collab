# Contributing to Quoin Collab

Bug reports, fixes and documentation corrections are all welcome. Questions go to
[Discussions](https://github.com/AmineSeboui/quoin-editor/discussions), which Quoin's packages share. Please
follow the [code of conduct](CODE_OF_CONDUCT.md), and report a security problem privately as
[SECURITY.md](SECURITY.md) explains, never in a public issue.

## Setup

You need Node 20.11 or newer, which is what the packages declare, and npm. CI runs Node 24.

```bash
git clone https://github.com/AmineSeboui/quoin-collab.git
cd quoin-collab
npm install
npm run check
```

`check` is the whole gate and runs in this order:

1. `npm run build`, first, because the server's tests import the client by name, which resolves to its
   built output rather than its source.
2. `npm run typecheck`, each package and its tests separately, since they carry different libs and types.
3. `npm run lint`, which is type-aware.
4. `npm test`.
5. `npm run check:consumer`, which packs the tarballs, installs them into a scratch project the way a
   stranger would, typechecks against them and runs them. It is the only check that sees what `files` and
   `exports` actually ship, so a change to either needs it.

The server runs from source with `npm run dev`, no build step, because nothing in it is syntax Node cannot
erase. Keep it that way: `erasableSyntaxOnly` is on and will tell you if you do not.

## What a change needs

- A test that fails without it. For a fix, write the test first and watch it fail against the old code; a
  test that passes either way is worse than none, because it looks like cover.
- A change to the wire goes into `src/protocol` in both packages, in the same commit. The two folders hold
  the same files, and a test fails while they differ.
- The public surface of a package changed means `exports`, the README and `check:consumer` all move with it.
- A behaviour change that a consumer could notice means a line in [CHANGELOG.md](CHANGELOG.md) under
  Unreleased, in the same terms a reader would use.

## Releasing

Both packages share one version, so a client and a server from the same release always understand each
other. Bump both, write the changelog section, merge, then tag `vX.Y.Z` on `main`. The release workflow
checks the tag against both packages' versions, runs the whole gate again on a clean runner, and publishes
the server and the client with provenance.
