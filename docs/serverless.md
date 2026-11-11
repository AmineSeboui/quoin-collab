# Running in a function

The server holds no state that has to live in one process, so it runs in a serverless function as well as a
long-lived one. [Quoin Cloud](https://quoincloud.com) does exactly that, on Vercel.

Two things are different, and both have to be handled rather than hoped about.

## Connections end on a timer

A function has a maximum duration, and reaching it closes the socket even though nothing is wrong. On Vercel's
Hobby plan that is 300 seconds.

The client treats a close as ordinary. It reconnects after about 150 milliseconds the first time, backs off
only if reconnects keep failing, and resyncs through the same step 1 and step 2 exchange as a first connect.
Nothing is lost, because the document is in the browser and the server is brought back up to date from it. An
editor mid-sentence does not notice.

This is why the first retry is fast. A second of waiting would be reasonable for a fault and is far too long
for a reconnect that happens every five minutes by design.

## Connections do not share a process

Two people in one room may be served by two different function instances, and nothing routes them together.
With the default fanout, which reaches nobody, they would each see a room with one person in it.

So a serverless deployment needs `REDIS_URL`. This is not a scaling nicety there, it is the difference between
collaboration working and appearing to work for one person at a time.

Without it the deployment still functions whenever both clients happen to land on the same warm instance, which
is most of the time at low traffic and is exactly the kind of thing that works in testing and fails in front of
an audience.

## Vercel

Set the WebSocket route to the Node runtime, raise `maxDuration` as far as the plan allows, and let
`@vercel/functions` do the upgrade. Fluid compute must be on, which it is by default for projects created after
April 2025.

Persistence can be any Postgres, Neon included. The fanout wants a Redis; the Vercel marketplace has one.
