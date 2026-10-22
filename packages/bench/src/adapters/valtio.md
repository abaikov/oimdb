# What a valtio subscription hears, and when it hears it

Companion to `packages/bench/src/adapters/valtio.ts`.

## The recipe

valtio 2.3.2 through `valtio/vanilla` and `valtio/vanilla/utils`, the README's
"Use it vanilla" section (`node_modules/valtio/README.md:260-273`): a `proxy` state
mutated in place, `subscribe` for a listener on a proxy and everything under
it, and `subscribeKey` for one property of one proxy. No React, no
`useSnapshot`, no `snapshot`: the consumers read the proxies directly, which is
what the README's vanilla example does inside its listener.

Each wiring builds one `proxy` state:

- window and read wirings: `{ rows, byGroup }` — `rows` is the population by id
  and `byGroup[g]` is the bucket of group `g`, both holding THE SAME row proxy.
  The read wiring adds `cursor: { group, offset }`, view A's definition.
- churn wiring: `rows` alone.
- relation wiring: `{ rows, owners, pairs }`, pairs keyed by the composed
  address.
- single wiring: `{ value, bystander }`.

Every plain object assigned into a proxy is wrapped in its own Proxy on the way
in (`node_modules/valtio/vanilla.js:63`), so a row written once is a row proxy
from then on, and the adapter keeps nothing beside the state but references the
library handed back for a key.

## Why the sync flag, and what `settle` does

`subscribe(proxy, callback, notifyInSync)` has two arms
(`vanilla.js:193-225`). The default queues the callback on
`Promise.resolve().then` and so runs it once per microtask whatever was written
in between (`vanilla.js:210-216`). With `notifyInSync` it calls the callback
inside the property set that caused it (`vanilla.js:206-208`). No worker in this
harness yields to the event loop between a write and its `settle`, so the
default arm never reaches a consumer at all; the sync arm is the only one that
can. `subscribeKey` passes the flag through (`vanilla/utils.js:5-17`).

A sync listener here only MARKS its view. `settle` renders every marked view
once. That is the default arm's coalescing moved from the microtask to the frame
boundary the harness already has, and nothing more: the marking is driven by the
library's notification, and a view no notification marked is not rendered.

## What a frame is to valtio

Nothing. The vanilla entry exports `proxy`, `subscribe`, `snapshot`, `ref`,
`getVersion` and the `unstable_` hooks (`vanilla.js:278-285`); there is no batch
or transaction. `frame(run)` calls `run()`.

## What a write costs

- A property set on a proxy compares the new value with the old by `Object.is`
  and returns without notifying when they match (`vanilla.js:53-58`). That is
  the only value check in this adapter: a write of an existing row is
  `Object.assign` of the incoming row onto its proxy, so a re-send of unchanged
  values notifies nothing, and a write of a new row assigns a copy and is always
  a notification.
- A notification climbs: the row proxy's listeners include a prop listener in
  every parent that itself has listeners (`vanilla.js:111-133`, `:142-165`), so
  a write to a row in a watched bucket runs the bucket's listeners. A parent
  nobody listens to — `rows` and `byGroup` in every wiring — is never wired to
  its children and costs nothing per write.
- A subscription is to a WHOLE SUBTREE. A window view listens to its bucket, so
  a note write, or a label write to a row below the window, marks it and
  `settle` delivers text it already shows — redundant, counted, not suppressed.
- A move is three notifications: the `group` set, the delete from the old bucket
  and the assignment into the new one; each marks the view over its bucket.
- The load is one notification per row written, each a flag set.

## The cells, the reads and the relations

`pin` stops the window listeners and resolves the pinned row proxies once, then
puts one `subscribeKey(row, 'label')` and one `subscribeKey(row, 'note')` on
each. `subscribeKey` is a whole-proxy `subscribe` that calls its callback only
when `Object.is` says that one property moved (`vanilla/utils.js:9-13`), so a
label write runs both listeners of the row and marks the label view only.

The read wiring's view A listens to `cursor` and to the bucket of the cursor's
group, and `switchGroup` re-points that bucket subscription: it releases the old
one and subscribes to `byGroup[group]` before setting the cursor, so a write to
another group never marks view A. The re-subscription is in the timed switch and
costs what valtio charges for a first listener — wiring every row proxy of the
new bucket (`vanilla.js:142-152`) — and for a last one leaving, the unwiring
(`:153-163`). View B listens to group A's bucket alone. A scroll is one set of
`cursor.offset`; a switch is two sets, `cursor.group` and `cursor.offset`, and
one delivery at `settle`. Both views
select through the harness's top-k helpers (`visibleInto`, `visibleOnAxisInto`)
over the bucket's values.

The relation views listen to the `owners` and `pairs` records. The line
sources — each line's owner proxy and pair proxy — are resolved once at
`holdRelation`; `writePair` composes the address per call and looks the pair up
through `pairs`.

## The churn wiring

A row subscriber is `subscribe(row, body, true)`; the column subscriber is
`subscribeKey(row, 'label', body, true)`. `subscribe` takes ONE proxy, so the
wide subscriber is one `subscribe` per source sharing one body, and its unmount
releases all of them. The mount records the read from the proxy and is not a
wake; `woke` is counted only in the body; `unmount` releases and clears the read
slot.

## The chain and the diamond are declined

valtio 2.3.2 ships no `derive`: it moved out in v2 to the separate
`derive-valtio`, which is not installed, and the utils this version ships are
listed at `vanilla/utils.js:575-583`. A chain or a diamond could only be plain
proxies this adapter rewrites by hand inside its own `subscribe` callbacks, and
the diamond's join, rewritten once per branch, would need the adapter to hold
the wake back and dedup it in `settle`. B3 of `churnChain` and `churnDiamond`
forbids both. The reasons are in `churn.chain.absent` and `churn.diamond.absent`.

## Which arm of the audit bites

`readAll` reads `rows`; `groupOrder` reads `byGroup[g]` without creating it, so
a row its bucket lost or kept after a move is caught there and nowhere else.
