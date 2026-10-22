---
participant: "tanstack-store"
version: "0.11.2"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "7d9cfebef0f42929"
verdict: "idiomatic"
summary: "A `Store` per row, a bucket `Store` per group, and a derived store (`createStore(fn)`) per view with `subscribe` as its consumer, all on @tanstack/store 0.11's alien-signals core; every frame and every multi-store write runs inside the library's `batch`, the cell wiring narrows to a column with a derived store per pinned cell, and the chain, diamond and view switch are the library's own derived stores. 0.11.2 exports no `Derived` or `Effect` class: `createStore(fn)` is the derivation and `subscribe` the only subscriber."
wirings:
  bind:
    verdict: "idiomatic"
    note: "A derived store per view over one bucket store and its row stores, consumed by `subscribe` (tanstack-store.ts:205-214, selection at :50-80). `write` and `remove` touch only the row stores and the touched buckets, each inside one `batch` (:106-170). `frame` is `batch` (:39-41; node_modules/@tanstack/store/src/atom.ts:70-79), carried by every binding. `readAll` reads `.state` of each row store through `byId` (:276)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty views (tanstack-store.ts:741); disjoint dependency sets, routed by the library's graph."
  churn.row:
    verdict: "idiomatic"
    note: "`subscribe` on the row store, reading `label` (tanstack-store.ts:380-384, helper :303-314). `subscribe` does not call back on subscribe (src/atom.ts:178-191), so the mount reads `.state` into `churnRead[at]` (:312) and is not counted; each callback records the read and counts a wake (:308-311); `unmount` unsubscribes and clears the slot (:412-418)."
  churn.wide:
    verdict: "idiomatic"
    note: "A derived store over the `count` row stores, ending on row `from`, subscribed (tanstack-store.ts:316-322, :385-386). A subscription watches one store (src/atom.ts:178-191), so several sources are expressed as the library's own derived store over them."
  churn.column:
    verdict: "idiomatic"
    note: "`createStore(() => source.state.label)` under the subscription (tanstack-store.ts:388-392). The derived store's `Object.is` compare (src/atom.ts:201, :222) stops a `note` write there, so the column identity is the library's."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is a derived store over the `count` sources returning `chainLevelOf(label of row from, 1)`; levels 2..depth each derive `chainLevelOf(level below, level)`; `subscribe` on the head (tanstack-store.ts:393-402)."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two derived stores over root row `from` (`diamondLeftOf`, `diamondRightOf` of its label), a third over both (`diamondJoinOf`), `subscribe` on the join (tanstack-store.ts:403-411). The subscription effect is queued once per propagation because `propagate` queues only a WATCHING sub (src/alien.ts:151-153) and `notify` clears that flag as it queues (src/atom.ts:52-55); it re-runs only after `checkDirty` (src/atom.ts:302-309); not run here, the diamond script's check asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `byId.get` and one `.state` read per key, outside any tracking context, nothing hoisted (tanstack-store.ts:480-488)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "Offset store (tanstack-store.ts:436) read only by view A's derived store, which returns the offset with the rows (:440-452), subscribed at :463-465. `scrollTo` is one `setState` (:489-491). View B (:453-460) does not read the offset."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a derived store over the same bucket with the second predicate (tanstack-store.ts:453-460, predicate at :61)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "View A's group is a store (`$group`, tanstack-store.ts:437) that view A's derived store reads beside `$offset` (:440-452). `switchGroup` sets `$group` and resets `$offset` to 0 inside one `batch` (:492-497), so the subscription runs once over the new group's bucket. View B reads neither."
  relations:
    verdict: "idiomatic"
    note: "Owner and pair records each get a store. View A is a derived store over the owner stores and view B over the pair stores (tanstack-store.ts:598-611), so the dependencies are disjoint. `writePair` composes the key on every call (:622-626). The population stores (:514, :517) are written only in the untimed `writeOwners` and `holdRelation`."
  single:
    verdict: "idiomatic"
    note: "`createStore('')` and `subscribe`, written with a bare `setState` (tanstack-store.ts:650-706). The setter flushes on its own (src/atom.ts:261-268) and skips an `Object.is`-equal value (src/atom.ts:222), which is what `singleResend` meets."
improvements:
  - "DECLINED, docs checked 2026-10-20 — every store here is a `Store`, which wraps an atom and binds three methods per instance (node_modules/@tanstack/store/src/store.ts:30-37; dist/store.js:7-9); `createAtom` (src/atom.ts:146-273) is the primitive underneath. The TanStack Store docs present `Store` as the API: the quick-start opens with 'You'll start by creating a new store instance, which is a wrapper around your data' and never mentions `createAtom` (tanstack.com/store/latest/docs/quick-start); `createAtom` appears only as a bare signature in the generated reference (docs/reference/functions/createAtom), with no guidance on when to prefer it. The docs do not point to the lighter primitive, so the per-row `Store` (tanstack-store.ts:126, :339, :541) stays. What it costs — one wrapper object and three bound functions per row on `batchInsert`, `coldStart`, `appFill` and `growUnderSubscription` — is unmeasured."
---

## Version and recipe

`node_modules/@tanstack/store/package.json` is `0.11.2`, the same as `version`
(tanstack-store.ts:710). The package ships no README; `docs` is the homepage from
package.json, and this audit did not read the online documentation. The recipe is
checked against the shipped `src/` (listed in the package's `files`) and its exports
in `dist/index.d.ts`: `createStore` (src/store.ts:86-105), `Store.setState`
(:43-45), `.state` (:46-48), `subscribe` (:52-56 → src/atom.ts:178-198) and `batch`
(src/atom.ts:70-79). `Derived` and `Effect`, which earlier lines of the library
exported, do not exist in 0.11.2 (src/index.ts:1-4; dist/index.js exports
`ReadonlyStore, Store, batch, createAsyncAtom, createAtom, createStore, flush, shallow,
toObserver`); `createStore(fn)` returning a `ReadonlyStore` is the derivation
(src/store.ts:59-84, :98-99, src/atom.ts:237-255).

What runs is `dist/index.js` (the `import` arm of `exports['.']`, the package being
`"type": "module"`), not `src/`. The verifier checked that the dist files carry the
same mechanisms the `src/` lines describe: `batchDepth` and the flush guard
(dist/atom.js:34-49), `options?.compare ?? Object.is` (dist/atom.js:124, :134), the
skipped first callback (dist/atom.js:112) and the three binds (dist/store.js:7-9).

## Batching

`frame(run)` is `batch(run)`. While `batchDepth > 0`, `flush` returns at once
(src/atom.ts:89-92), so every `setState` inside a frame propagates and queues the
effected subscriptions, which run once when the outermost `batch` returns. Methods
writing several stores carry their own nested `batch`; single-store methods call
`setState` bare, because `Atom.set` calls `flush` itself (src/atom.ts:261-268).

## What the adapter adds

- The id and group maps hold store handles (tanstack-store.ts:202-203), never values.
- `write` drafts each touched bucket once per batch (tanstack-store.ts:112-121).
- Subscriptions deliver nothing at creation (src/atom.ts:183-185), so `pin`,
  `holdRelation` and `holdSingle` deliver once, untimed, after subscribing
  (tanstack-store.ts:265-266, :616-617, :682-683), as the Redux adapter does.
- The derived stores that feed a consumer an array build a fresh array per recompute
  (:230-236, :598-611), because the compare is `Object.is`.
- No equality function is written in the adapter. `createStore` takes no compare
  option (src/store.ts:86-97), so every skip is `createAtom`'s default `Object.is`
  (src/atom.ts:201). The library ships `shallow` (src/index.ts:4) and `createAtom`
  accepts `compare`; neither is used, which leaves the library's default and gives the
  adapter no check of its own.
- The bucket drafts in `write` and the per-touched-group filter in `remove` are
  ordinary copy-on-write over an array store, the same shape as the preact, vue and
  solid rows, and skip no work the script asks for.

## Teardown

A derived store whose last subscriber leaves is `unwatched` and purges its deps
synchronously (src/alien.ts:101-128, src/atom.ts:56-62). `pin` dropping the window
subscriptions and a churn `unmount` therefore leave no live edges behind, unlike the
nanostores adapter's deferred detach.

## Unverified

Nothing here was run. Type-checking of the overload resolution `createStore<T>(value)`
versus `createStore(fn)` (src/store.ts:86-97) and of the structural `TSource` type
(tanstack-store.ts:45-48) is left to the compile.

Verified 2026-10-17 by a second reader: every adapter line cited held except one
(`churnRead[at]` read at :312, not :313). Every `src/store.ts` line in the first draft
was off by two to six lines and has been corrected (`createStore` :86-105, `setState`
:43-45, `.state` :46-48, `subscribe` :52-56, `ReadonlyStore` :59-84, binds :34-37);
the `src/atom.ts` and `src/alien.ts` lines held. The note that the dist build, not
`src/`, is what loads was added. TanStack's online docs were read on 2026-10-20 for
`Store` against `createAtom`; see `improvements`. Adapter line numbers re-read the same day.
