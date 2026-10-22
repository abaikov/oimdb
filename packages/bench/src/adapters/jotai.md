# When a jotai store flushes, and what its equality can see

Companion to `packages/bench/src/adapters/jotai.ts`. The row's admission and departure statements:
see `packages/bench/PARTICIPANTS.md`.
https://jotai.org/docs/core/store
https://github.com/jotaijs/jotai-family  (jotai 3.0.1 no longer exports `atomFamily` from
`jotai/vanilla/utils`, node_modules/jotai/dist/vanilla/utils.js:1-12, so this package is the
recipe for "one atom per key")

## How consumption is forced, and when the flush happens

A derived atom nothing subscribes to is inert. `store.sub(viewAtom, …)` MOUNTS it and, transitively,
every atom it read, so a write invalidates it and the store recomputes and calls the listener. It
cannot defer — the flush happens in the `finally` of the outermost `store.set`, before the write
returns — hence `settle()` is a no-op. Three top-level sets are therefore three flushes and would
deliver a state with a move half done, which is why `setGroup` goes through one write-only atom.

`store.sub` does NOT call its listener on subscribe, so nothing is delivered at subscription and a
mount is a mount. The first delivery is the one the first write causes.

## What a frame is in jotai

jotai has no `batch` call. Its one batching construct is the write function of a write-only atom:
the `set` it is handed writes without flushing (`vanilla/internals.js:495-531`), and the flush runs
once in the `finally` of the `store.set` that invoked it (`vanilla/internals.js:695-709`), where a
bare `store.set` flushes on its own. So `frame(run)` is one `store.set` on a write-only frame atom,
and while `run` executes every write method of the binding writes through that atom's `get` and
`set` instead of the store's. The batch atoms the methods already use (`writeRows`, `moveRow`, …)
are then called through the frame's `set`, which is jotai's own way of composing them, and the
frame's writes reach the listeners as one flush.

## What `Object.is` on a whole row can and cannot see

Jotai's equality is `Object.is` on a whole row object, so a re-send of freshly allocated objects
genuinely invalidates every row atom; the column atoms over them then recompute to equal values and
stop it. A result array is fresh on every recompute: a buffer handed back a second time would say the view did not change and the subscriber
would stop being called, and an array set back after mutation would tell the store nothing changed.

## What the view atoms read

A view atom never reads a row atom. Per row it reads three derived column atoms, one
`jotai-family` family each (`columnFamiliesOf`): `group` and `rank` of every id in the
bucket, and `label` of the ids it renders. Each returns a primitive, so jotai's own
`Object.is` stops propagation there, and the store recomputes the view atom only when one of
those values changed (`hasChangedDeps`, node_modules/jotai/dist/vanilla/internals.js:295-310).
A `note` write therefore recomputes three column atoms of that row and
nothing above them; so does a `label` write to a row outside the window. The view atom
returns the selected ids, and its listener reads those rows back through `store.get`: a list
of ids plus an atom per key, the families being `atomFamily` over derived atoms, which
jotai-family allows ("`initializeAtom` is a function that can return any kind of atom",
node_modules/jotai-family/README.md:15). `splitAtom` does not fit: it splits one array atom into item atoms, and this store
has no array of rows to split.

A view atom that does recompute to the same ids in the same order — a row moving into a
watched group below its window, a rank change outside it — still notifies, because the array
is new. jotai ships no array comparator — `selectAtom` takes an equality function from its
caller — so keeping the previous array would be a value check written here, which the
contract forbids.

## What a row atom's granularity leaves the column scripts

A ROW ATOM HOLDS A WHOLE ROW, so a subscription to it cannot be told which column changed. A
derived atom reading ONE column of it returns a string, and `Object.is` on that string is what stops
propagation. The cell wiring uses exactly that: `pin` builds, per pinned row, a label atom and a
note atom, and subscribes each column's render to its own atoms — so a label write recomputes both
atoms of that row and only the label view is called. The churn column shape is the same selector
atom, `get(rowAtom)?.label` — it allocates a second atom, mounts it, and mounts the row atom under
it, a like-for-like rather than a row subscription under another name. The view atoms above are
built from the same kind of column atom.

## Chain, diamond and view switch

All three are derived atoms. A chain is `depth` derived atoms stacked: the bottom one reads
every root row atom and returns `chainLevelOf(label, 1)`, level k returns
`chainLevelOf(get(level k−1), k)`, and the listener reads the head through `store.get`, so the
text it reads is `chainHeadOf(label, depth)`. A diamond is two derived atoms over the root row
atom's `label` (`diamondLeftOf`, `diamondRightOf`) and a third reading both (`diamondJoinOf`),
subscribed with `store.sub`; jotai recomputes the invalidated atoms of one flush in
dependency order (a topological sort, `vanilla/internals.js:229-313`), so the join is recomputed and its listener called once per write. The view
switch is a `pagedGroupAtom` the paged view atom reads beside `offsetAtom`; `switchGroup` sets
both through one write-only atom, so they reach the listener as one flush and not as a
half-switched page.

## Where the audit's key list comes from

`getParams` is jotai-family's own record of every key it has minted an atom for, so nothing in this
file writes it and no timed path carries a structure only the audit reads. A removed row's atom
stays in the family holding `undefined`, which is skipped exactly as a missing row is.
