---
participant: "tanstack-db-eager"
version: "0.15.0"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "81435bf07fa857e9"
verdict: "idiomatic"
summary: "The same adapter as tanstack-db with autoIndex 'eager' on every backing collection, one of the two remedies the library's orderBy warning offers. On the churn and single wirings eager builds an index on id that only the column, chain and diamond mounts' initial loads read; the scroll wiring is supplied here because an indexed window moves synchronously. Under 0.15's publication context the diamond's join runs once per write, as on tanstack-db."
wirings:
  bind: { verdict: "idiomatic", note: "Identical body to tanstack-db (bindWith('eager') through adapterWith, adapters/tanstack-db.ts:858-892, 905-917): projected window queries (tanstack-db.ts:227-245) and, after pin, one projected live query per cell column (tanstack-db.ts:253-273). Under eager the orderBy compiler calls ensureIndexForField on the first order key (node_modules/@tanstack/db/src/query/compiler/order-by.ts:180-197), so an auto:rank index is built and the ordered query lazy-loads instead of warning." }
  bindPerGroup: { verdict: "idiomatic", note: "Fifty projected live queries over one eagerly indexed collection (tanstack-db.ts:891); the first one mints auto:rank and the rest find it (db/src/indexes/auto-index.ts:40-47)." }
  frame: { verdict: "idiomatic", note: "One sync transaction per collection the frame reaches, as on tanstack-db (tanstack-db.ts:77-106). Each committed batch with events also updates every index on the collection before it is emitted (db/src/collection/state.ts:1408-1411)." }
  churn.row: { verdict: "idiomatic", note: "subscribeChanges with where eq(row.id, …) (tanstack-db.ts:384-401). Under eager the subscription constructor calls ensureIndexForExpression (db/src/collection/subscription.ts:231-234), so the first mount on a churn binding's collection (created at tanstack-db.ts:334 through `syncedCollectionOf`, :111-139) builds an auto:id index over the population inside a timed cycle (auto-index.ts:58-73), and every later mount scans the index list to find it (auto-index.ts:40-47). That is what eager does for this call; declared in departure (tanstack-db.ts:909-912). Per-slot reads feed the verify pass's read fold as on tanstack-db." }
  churn.wide: { verdict: "idiomatic", note: "where inArray(row.id, sources) (tanstack-db.ts:393-396); inArray compiles to 'in', an indexable operation (db/src/query/builder/functions.ts:707-714), so it shares the auto:id index. The body reads the first source alone, which is what churnWide's model expects; declared (tanstack-db.ts:846-848)." }
  churn.column: { verdict: "idiomatic", note: "A select(id, label) live query per subscriber (tanstack-db.ts:402-423), TanStack DB's only column narrowing." }
  churn.chain: { verdict: "idiomatic", note: "depth live queries deriving chainLevelOf with fn.select, built in the mount and cleaned up in the unmount (tanstack-db.ts:424-469, 352-359); as on tanstack-db." }
  churn.diamond: { verdict: "idiomatic", note: "Two fn.select branches over root `from` and an innerJoin live query over both selecting diamondJoinOf (tanstack-db.ts:470-505). Eager changes how the branches load, not when the graphs run: in 0.15 each committed batch is published inside withPublicationContext (db/src/scheduler.ts:183-216; db/src/collection/changes.ts:272-283) and the join is scheduled with its branches as dependencies (db/src/query/live/graph-scheduler.ts:13-29), so it runs once per write. Read, not run; the adapter's departure says the same (tanstack-db.ts:843-845)." }
  reads.byKey: { verdict: "idiomatic", note: "collection.get per key (tanstack-db.ts:568-576)." }
  reads.byWindow: { verdict: "idiomatic", note: "Supplied on this row (only the 'off' row declines it, tanstack-db.ts:868-871). paged.utils.setWindow({ offset, limit }) (tanstack-db.ts:579-587) runs the window function that moves db-ivm's top-K in place (db/src/query/live/collection-config-builder.ts:299-410, 881-889; db-ivm/src/operators/topKWithFractionalIndex.ts:59, 68) inside a publication context, and returns true when no subset load was started (collection-config-builder.ts:392-396); rows a moved window needs come through the lazy load the auto:rank index serves. The binding throws if setWindow ever returns a promise." }
  reads.byTwoAxes: { verdict: "idiomatic", note: "q.fn.where inside the pipeline (tanstack-db.ts:542-555); the library decides when view B changes." }
  reads.bySwitch: { verdict: "idiomatic", note: "A new paged live query over the new group, the old one unsubscribed and cleaned up, marked by its own includeInitialState snapshot (tanstack-db.ts:527-540, 589-594). Under eager the auto:rank index the first paged query minted is found again by the new one's orderBy compile (auto-index.ts:40-47 returns on an existing index matching field and compare options), so the switch lazy-loads the new group's first window rather than the whole group." }
  relations: { verdict: "idiomatic", note: "As on tanstack-db (tanstack-db.ts:622-753), with all three collections on eager: each is built by `syncedCollectionOf`, which passes `autoIndexOf(indexing)` (tanstack-db.ts:122, 626-628)." }
  single: { verdict: "idiomatic", note: "A row per value and subscribeChanges narrowed by where eq(row.id, …) (tanstack-db.ts:785-812); under eager holdSingle's first subscription builds the auto:id index, untimed, and every write then maintains it." }
improvements:
  - "Create the backing collection for the churn and single wirings with autoIndex 'off', if this row is meant to measure eager only where it serves a query (every collection takes its autoIndex from `syncedCollectionOf`, tanstack-db.ts:122). Not done: what the row stands for is the registry owner's decision; the departure states what eager does there."
---

## Version

`version` is `0.15.0` (adapters/tanstack-db.ts:864, through `adapterWith`) and
`node_modules/@tanstack/db/package.json` declares `0.15.0`; `@tanstack/db-ivm` is
installed at `0.2.0`.

## Relation to tanstack-db

The three rows share every builder; the only argument is `TIndexing`
(tanstack-db.ts:60-69), and this row is `'eager'`. Everything on the `tanstack-db` card
about the sync write path, the one-sync-transaction frame (db/src/collection/sync.ts:
285-313), the partial merge (db/src/collection/state.ts:1262-1266), the `deepEquals`
value check that drops note writes on the projected queries (state.ts:1392-1402),
delivery before `commit()` returns under the publication context
(db/src/scheduler.ts:183-216), the chain and diamond shapes, the switch, the churn read
fold, the read through `toArray` (db/src/collection/index.ts:1114-1116) and the code
volume applies here unchanged and is not repeated. The one wiring that differs in kind is
`reads.byWindow`: declined on `tanstack-db`, supplied here. Registering several
configurations is allowed by BENCHMARKING.md §4 at the repository root.

## What 'eager' does in these wirings

`autoIndex: 'eager'` requires `defaultIndexType`; the constructor throws without it
(db/src/collection/index.ts:476-483), and the adapter passes `BTreeIndex`
(tanstack-db.ts:125): eager builds every auto index with that one type
(auto-index.ts:57-70), and BasicIndex's own doc says "Use BTreeIndex for write-heavy
workloads with large collections" (db/src/indexes/basic-index.ts:28-36), which is
what a rank rewritten across ten thousand rows is. The installed type documentation describes eager as
"Automatically create indexes for simple where expressions in subscribeChanges" and
`'off'` as the default, "Use explicit indexes for better bundle size"
(db/src/types.ts:785-794) — that is `tanstack-db-indexed`. The orderBy warning offers
eager as one of two remedies (db/src/query/compiler/order-by.ts:211-220).
`ensureIndexForField` mints only when `autoIndex === 'eager'`
(db/src/indexes/auto-index.ts:10-15, 29-56). It is reached from:

- the orderBy compiler, for the first order key of an ordered query
  (order-by.ts:180-197) — the `rank` index the window and paged queries use;
- every `subscribeChanges` with a `where`, through `ensureIndexForExpression`
  (db/src/collection/subscription.ts:231-234, auto-index.ts:86-100);
- an ordered `currentStateAsChanges` (db/src/collection/change-events.ts:335-350);
- join and include compilation for lazy targets (db/src/query/compiler/joins.ts:490-494,
  compiler/index.ts:808-820) — reachable by the diamond's innerJoin against the branch
  live query collections, which are created without `autoIndex` and so take the default,
  off.

Whether the live query's own subscription to the backing collection passes its `group`
predicate as a `whereExpression` (and so builds a `group` index) was not traced.

On the churn wiring every row subscriber is `subscribeChanges` with `where` on `id`
(tanstack-db.ts:384-401). The first mount on the binding's collection builds `auto:id`
over every row (auto-index.ts:58-73); each mount after it runs
`Array.from(collection.indexes.values()).find(...)` before returning
(auto-index.ts:40-47). Every write that emits an event then updates that index
(state.ts:1408-1411). The row and wide subscribers ask for no initial state, so they
never read it; the column, chain and diamond mounts build live queries whose initial load
can go through it.

## Hoisting

Nothing is hoisted beyond what `tanstack-db` hoists: the sync interface returns no
handle.

## Not determined

- Which indexes exist on the backing collection under `bind` beyond `rank`.
- That a moved window, and the switched query's first window, are filled synchronously
  by the lazy load (no subset promise); read from source, not run.
- That the rebuilt paged query finds the existing `auto:rank` index instead of minting a
  second one; read from auto-index.ts and order-by.ts, not run.
- How often a churn binding (and so its `auto:id` build) is created per process; the
  index lives on the binding's collection.
- The diamond running once per write; derived from the scheduler source, not run.
- The cost of the `auto:id` index on the churn rows, and the time effect of every claim
  on this card. Nothing was run.
