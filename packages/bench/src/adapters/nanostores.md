# What a nanostores computed can depend on, and when a write notifies

Companion to `packages/bench/src/adapters/nanostores.ts`.

## What a computed can depend on, and when

A `computed` is LAZY until its first listener mounts it (`onMount` in
`node_modules/nanostores/computed/index.js`). `.subscribe` mounts it and fires
immediately, so from bind onwards every notification re-runs it and pushes, in
the same tick.

`computed(stores, cb)` takes its dependency list ONCE, at construction; the
harness binds against an EMPTY store, so a view over per-row atoms would be
built over zero atoms and never hear about a row. Per-row atoms are only
expressible if the view computeds are rebuilt on every population change, which
is a rebuild, not a derivation.

What IS known at bind is which groups are watched. So the window wiring keeps
ONE `map` STORE PER GROUP, created on first ask — for the watched groups, at
bind — and each view is a computed over its own group's store. A point write
spreads that group's record (about 200 keys) rather than the population's, and
reaches only the view over that group; a move takes the row out of one group's
store and puts it into the other's, two `set`s and two notifications, one per
view. An id → store table beside them holds handles only.

The cell wiring built by `pin` is a `computed` per pinned cell and column, over
that row's group store and returning its `label` or `note` string, and one
`computed` per column over its cells. A label write recomputes every cell
computed over that group's store, but a note cell returns the same string and
the atom's own `set` drops it (`Object.is`, `atom/index.js`), so the note
column computed's sources are unchanged and the note consumer is not delivered.
No comparison is written here.

The read wiring keeps the population in one `map` store: both of its views are
over the same group, so a partition would not separate them. Its point writes
spread the whole 10 000-key record, but the only timed writes in that wiring
are the four moves of the two-axis script; a partition would add an id → store
lookup to every key of `readByKey`, whose lookup is the measurement, and view A's
computed would need every group's store at bind to follow a switch, which
`TViewConfig` does not name. Not made. View A's group and
offset live in ONE atom, because a view switch changes both and `switchGroup` is
not called inside a frame, so two atoms would notify — and deliver — twice per switch.

nanostores documents `listen` as "the same as subscribe but without calling the
listener immediately", so a mount is a mount and not also a wake-up.

## A computed with no listener stays attached for a second

When a computed loses its last listener, nanostores detaches it from its
sources only in `setTimeout(…, STORE_UNMOUNT_DELAY)`, a 1000 ms timer
(`node_modules/nanostores/lifecycle/index.js:117`, `:136-145`). No worker here
yields to the event loop during a sample, so the timer never fires inside one:
an unmounted computed keeps its source edges and is recomputed by every later
write to those sources. This is a KNOWN EFFECT ON THE CHURN ROWS — every
`mountOnRows` over more than one row, every chain and every diamond — and
on `cellDelivery`, where the two window computeds `pin` unsubscribed keep
recomputing. The unmount itself does less work and every later write does more;
which way the sum moves is not measured. There is no public workaround:
`cleanStores` throws in production and the workers run as production. The
adapter does not hack around it.

## The order a non-reactive index forces on every write path

nanostores notifies SYNCHRONOUSLY — `atom.notify` drains its queue inline
(`node_modules/nanostores/atom/index.js`), so `settle()` is a no-op. A frame is
its synchronous `batch(fn)` (`atom/index.js:43-57`): listeners are queued while
`fn` runs and drained once when the outermost batch returns, each with the store's
final value, so a frame of writes delivers once per touched view. (`batched()` is a
different thing — a computed that recomputes in a `setTimeout` — and is not used.)

IN THE READ WIRING, THE GROUP INDEX (group → SET OF IDS) IS NOT REACTIVE, which puts an obligation
on every write path: UPDATE THE INDEX BEFORE PUBLISHING TO THE STORE. A
computed can only depend on a store that existed at bind time — the population
map — and `set`/`setKey` run their listeners INLINE, so a view recomputing
against a Set that had not caught up would derive the wrong window.