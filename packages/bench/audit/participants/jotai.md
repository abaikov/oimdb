---
participant: "jotai"
version: "3.0.1"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "3bb75af12b3f3033"
verdict: "idiomatic"
summary: "A vanilla jotai 3 store with one atom per row (jotai-family, since jotai 3 no longer ships atomFamily), per-column derived atom families (group, rank, label) under a derived view atom per view that selects ids, store.sub per consumer, a per-column derived atom per pinned cell, derived atoms for the chain and the diamond, and every script frame written through one write-only atom. A note write, or a label write outside the window, stops at the column atoms; a view whose recompute selects the same ids still notifies, because jotai ships no array equality and the adapter may not write one."
wirings:
  bind: { verdict: "idiomatic", note: "Derived atom per view (adapters/jotai.ts:156-161) built by selectIds (jotai.ts:89-124): it reads the group's ids atom, then per id the derived group and rank column atoms, and the label column atom of the ids it renders (columnFamiliesOf, jotai.ts:77-81) — never a row atom. Each column atom returns a primitive, so Object.is (node_modules/jotai/dist/vanilla/internals.js:684) stops a write the view does not read, and the view atom is recomputed only when one of its dependencies changed (hasChangedDeps, internals.js:295-310). The view atom returns the selected ids; its listener reads those rows through store.get and delivers them (rowsOf, jotai.ts:126-133, 162-170). The cell wiring after pin builds a label atom and a note atom per pinned row and subscribes each column's render to its own atoms (jotai.ts:301-333). A recompute that selects the same ids still returns a fresh array; keeping the previous one would need an equality function written here (see improvements)." }
  bindPerGroup: { verdict: "idiomatic", note: "The same body with fifty views (jotai.ts:1055), each over its own group's ids atom." }
  frame: { verdict: "idiomatic", note: "frame is one store.set on a write-only frame atom; while it runs, every write method of the binding goes through that atom's get and set (access, jotai.ts:49-71), and a nested frame runs in place. The set a write function is handed does not flush while the outer write is synchronous (internals.js:495-531); only the outermost store.set recomputes and flushes in its finally (internals.js:695-709), cited at jotai.ts:48, so a multi-write frame reaches the listeners as one flush. Used by every wiring (jotai.ts:344, 456, 734, 917, 1007)." }
  churn.row: { verdict: "idiomatic", note: "store.sub directly on the resolved row atom for one source (jotai.ts:493-498); the listener reads the atom back through store.get and stores the label per slot (readRowInto, jotai.ts:404-407, 413-416), cleared on unmount (jotai.ts:551), which is what the verify pass's read fold checks." }
  churn.wide: { verdict: "idiomatic", note: "A derived atom built at mount that reads every source atom (jotai.ts:500-510), subscribed; mounting it mounts the CHURN_WIDE sources. The listener reads the first source's row atom, which is what churnWide's model expects." }
  churn.column: { verdict: "idiomatic", note: "A selector atom get(rowAtom).label subscribed (jotai.ts:512-520): a row write recomputes it and Object.is on the string decides whether the listener runs (internals.js:671-690)." }
  churn.chain: { verdict: "idiomatic", note: "depth derived atoms built inside the mount (jotai.ts:522-537): the bottom one reads the count root row atoms and returns chainLevelOf(joined labels, 1), level k returns chainLevelOf(get(level k-1), k); store.sub on the head mounts the chain and the roots, and the listener reads the head through store.get (headReaderOf, jotai.ts:409-411, 418-421), so the text is chainHeadOf(label, depth) (harness/derivations.ts:1-13)." }
  churn.diamond: { verdict: "idiomatic", note: "Two derived atoms over the root row atom (diamondLeftOf, diamondRightOf of its label), a third reading both (diamondJoinOf), store.sub on the third (jotai.ts:538-545). The store recomputes a flush's invalidated atoms in topological order and only those with a changed dependency (internals.js:229-313), and the flush collects listeners into a Set (internals.js:196-214), so the join is recomputed and its listener called once per write. Read, not run." }
  reads.byKey: { verdict: "idiomatic", note: "rowFamily(key) plus store.get per key (jotai.ts:718-726); store.get outside a read function mounts and tracks nothing." }
  reads.byWindow: { verdict: "idiomatic", note: "offsetAtom (jotai.ts:578) written through the frame-aware setter (jotai.ts:728-730); pagedAtom re-selects the top offset+window ids of the group through the column atoms, reading label only for the ids from the offset on, and returns a fresh { offset, ids } object (jotai.ts:588-602); the listener reads the rows through store.get (jotai.ts:607-616). jotai keeps no ordered index, so the re-selection is the library's cost." }
  reads.byTwoAxes: { verdict: "idiomatic", note: "onAxisAtom (jotai.ts:603-605) reads the same column atoms, and none of a row the second predicate excludes (the axis test comes first, jotai.ts:104-105). A group move of such a row still rewrites the group's ids atom, which onAxisAtom read, so it recomputes and, returning a fresh array, still notifies view B. Keeping the previous array needs a comparator written in the adapter, which the contract forbids." }
  reads.bySwitch: { verdict: "idiomatic", note: "pagedAtom reads the group from pagedGroupAtom beside offsetAtom (jotai.ts:579, 588-602); switchGroup sets both through the write-only atom switchPagedGroup (jotai.ts:580-583, 731-733), so the two writes reach view A's listener as one flush. onAxisAtom never reads pagedGroupAtom. Read, not run." }
  relations: { verdict: "idiomatic", note: "Owner and pair atom families (jotai.ts:771-777); atoms resolved and pair records minted untimed in holdRelation (jotai.ts:822-830, 884-897); writePair composes the key per call and goes through pairFamily (jotai.ts:909-916). Two derived atoms render the two views (jotai.ts:832-847)." }
  single: { verdict: "idiomatic", note: "atom(initial) plus store.sub (jotai.ts:967-1027), jotai's own scalar and subscriber; an equal write is dropped by Object.is (internals.js:684)." }
improvements:
  - "NOT APPLIED: the contract forbids it. jotai.ts:89-124 and 588-605: return the previous ids array when the newly selected ids are the same in the same order, through the self-read selectAtom uses (node_modules/jotai/dist/vanilla/utils/selectAtom.js:9-27). jotai ships no array comparator (selectAtom's equalityFn defaults to Object.is and is otherwise the caller's), so the comparison would be a value check written in the adapter, which TBinding.write forbids. With the column atoms in place, the redundant deliveries left are recomputes that select the same ids: filterTwoAxes view B on a move of an excluded row, and batch steps landing in a watched group outside its window."
---

## Version

`version` is `3.0.1` (adapters/jotai.ts:1031) and `node_modules/jotai/package.json`
declares `3.0.1`. The adapter also bundles `jotai-family`, installed at `1.1.0`
(`getParams` at jotai-family/dist/atomFamily.js:43). jotai 3 no longer exports
`atomFamily` from `jotai/vanilla/utils` (node_modules/jotai/dist/vanilla/utils.js:1-12),
so `jotai-family` is the only family on offer. The code read is
`node_modules/jotai/dist/vanilla/internals.js`.

## What jotai documents and what the adapter does

The cited recipe is the framework-free store (`createStore`, `store.get`, `store.set`,
`store.sub`; docs: jotai.org/docs/core/store). In the installed source:

- `store.set` writes, then in its `finally` recomputes invalidated atoms and flushes
  listeners when anything changed (internals.js:695-709). One top-level `set` is one
  flush, which is why the batch writes go through write-only atoms (jotai.ts:201-269)
  and `settle` is a no-op.
- The `set` a write function is handed writes without flushing while the write is
  synchronous (internals.js:495-531). jotai has no other batching construct, so `frame`
  (jotai.ts:49-71) is one `store.set` on a write-only frame atom; see the `frame` wiring.
- A primitive atom counts as changed only when the new value is not `Object.is` the old
  (internals.js:684). Every row write stores a new object (`{ ...row }`), so a re-send of
  equal values invalidates every row atom; the column atoms over them recompute to equal
  primitives, and the view atoms above are not recomputed (internals.js:295-310). That is
  jotai's equality, not a check the adapter wrote.
- `store.sub` mounts the atom and its dependencies, then recomputes and flushes
  (internals.js:711-727).
- The invalidated atoms of one flush are recomputed after a depth-first topological sort
  of their mounted dependents, each only if a dependency changed (internals.js:229-313),
  so an atom reading two atoms that both changed in the flush is recomputed once, after
  both. This is what the diamond and the column-atom views rely on.

The group index is an ids atom per group holding keys only. A view atom reads it, then
per id the `group` and `rank` column atoms, and `label` for the ids it renders
(jotai.ts:77-124). Each column family is `atomFamily` over a derived atom, which
jotai-family allows ("`initializeAtom` ... can return any kind of atom",
node_modules/jotai-family/README.md:15). `splitAtom` was considered and does not fit:
it splits an array atom into item atoms, and this store keeps one atom per key, not an
array of rows.

## Chain, diamond and view switch

All three are jotai's own derived atoms (`atom(get => …)`):

- **Chain** (jotai.ts:522-537). `depth` derived atoms, each level applying `chainLevelOf`
  with its own number, so the head carries `chainHeadOf(label, depth)`. The listener on
  the head reads the head (`headReaderOf`, jotai.ts:418-421), not the root row, so the
  rendered text is the derivation's output.
- **Diamond** (jotai.ts:538-545). Left and right read the root row atom; the join reads
  left and right. Subscribing to the join mounts all three and the root.
- **View switch** (jotai.ts:579-583, 588-602, 731-733). `pagedGroupAtom` is what the
  paged view atom selects from; one write-only atom sets it and `offsetAtom` to 0, so the
  view never shows the old group at offset 0 or the new group at the old offset.

## Cells and windows route by column

A subscription to a row atom cannot be told which column changed. A derived atom
reading one column returns a primitive, and `Object.is` on it stops propagation.
`pin` builds one such atom per pinned row and column and subscribes the label render to
the label atoms and the note render to the note atoms (jotai.ts:301-333); a listener
subscribed to several atoms runs once per flush, because the flush collects listeners
into a `Set` (internals.js:196-214). A pinned label write therefore wakes the label view
only, as the churn column shape does (jotai.ts:512-520). The window and read views are
built from the same kind of column atom (jotai.ts:77-124), so a `note` write wakes no
view at all.

## Window identity

The window and axis atoms return a fresh array whenever they recompute. A reused buffer
would read as "no change"; keeping the previous array when the selection is equal is
what selectAtom does (selectAtom.js:12-25), but with an equality function supplied by
its caller. Not applied under the contract rule; see `improvements`.

## Churn read fold

Every churn listener stores what it read per slot (jotai.ts:404-421) and unmount clears
the slot (jotai.ts:551), so the verify pass's fold over every standing subscriber
(harness/render.ts:124-141) checks each one's own source.

## Declared departures, checked

- A removal rebuilds each touched group's ids atom once per batch (jotai.ts:237-253).
  Declared (jotai.ts:1033-1036).
- The timed teardown unsubscribes the view atoms only (jotai.ts:373-381). Declared.

## Hoisting

`pin`, `holdChurnRows` and `holdRelation` resolve family atoms once: the handle for a
key, which the contract allows. `readKeys` resolves nothing in advance
(jotai.ts:718-726).

## Not determined

- Whether `store.sub` calls the listener at subscription. `mountAtom` reads a fresh atom
  without marking it changed unless it was already invalidated (internals.js:455-460,
  570-585), so by reading it does not; not run.
- The time and memory effect of the three column families per row (created for every
  row a view reads, kept by the family), and of the cell, frame, chain, diamond and
  switch wirings. Nothing was run.
- `digest` above was not recomputed against this code.
