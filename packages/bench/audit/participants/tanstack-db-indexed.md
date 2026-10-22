---
participant: "tanstack-db-indexed"
version: "0.15.0"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "81435bf07fa857e9"
verdict: "idiomatic"
summary: "The same adapter as tanstack-db with autoIndex 'off' and explicit collection.createIndex on what each wiring's live queries filter and sort on, the remedy the library's orderBy warning names first and the configuration its type docs recommend. The scroll wiring is supplied here because an indexed window moves synchronously; under 0.15's publication context the diamond's join runs once per write, as on tanstack-db."
wirings:
  bind: { verdict: "idiomatic", note: "Identical body to tanstack-db (bindWith('explicit') through adapterWith, adapters/tanstack-db.ts:858-892, 919-932), plus two indexes created right after the backing collection and before any live query (tanstack-db.ts:221-224): group with BasicIndex, rank with BTreeIndex. rank is the first order key of the window queries, so the orderBy compiler finds it (node_modules/@tanstack/db/src/query/compiler/order-by.ts:199-207; utils/index-optimization.ts:45-70) instead of warning and loading the whole group. An id BTreeIndex is created in pin, before the pinned-cell queries that filter on id with inArray (tanstack-db.ts:288, 253-268), so only the cell scripts, the ones that call pin, maintain it." }
  bindPerGroup: { verdict: "idiomatic", note: "Fifty projected live queries over one explicitly indexed collection (tanstack-db.ts:891)." }
  frame: { verdict: "idiomatic", note: "One sync transaction per collection the frame reaches, as on tanstack-db (tanstack-db.ts:77-106). Each committed batch with events updates the explicit indexes before it is emitted (db/src/collection/state.ts:1408-1411)." }
  churn.row: { verdict: "idiomatic", note: "subscribeChanges with where eq(row.id, …) (tanstack-db.ts:384-401). An id BTreeIndex exists on this collection (tanstack-db.ts:335-337), built at bind, untimed; these subscriptions ask for no initial state and do not read it. autoIndex is off, so ensureIndexForExpression mints nothing (db/src/indexes/auto-index.ts:10-15, 86-93) and no mount builds an index; outside dev mode it returns before searching the list. Per-slot reads feed the verify pass's read fold as on tanstack-db." }
  churn.wide: { verdict: "idiomatic", note: "where inArray(row.id, sources) (tanstack-db.ts:393-396); the body reads the first source alone, which is what churnWide's model expects; declared (tanstack-db.ts:846-848)." }
  churn.column: { verdict: "idiomatic", note: "A select(id, label) live query per subscriber (tanstack-db.ts:402-423); its initial load of the one row can go through the id index." }
  churn.chain: { verdict: "idiomatic", note: "depth live queries deriving chainLevelOf with fn.select (tanstack-db.ts:424-469), cleaned up on unmount (tanstack-db.ts:352-359); level 1's inArray over the roots can load through the id index (every index supports 'in': db/src/indexes/base-index.ts:174; db/src/query/builder/functions.ts:707-714)." }
  churn.diamond: { verdict: "idiomatic", note: "Two fn.select branches over root `from`, each loading its one row through the id index, and an innerJoin live query over both selecting diamondJoinOf (tanstack-db.ts:470-505). Indexes change how the branches load, not when the graphs run: in 0.15 each committed batch is published inside withPublicationContext (db/src/scheduler.ts:183-216; db/src/collection/changes.ts:272-283) and the join is scheduled with its branches as dependencies (db/src/query/live/graph-scheduler.ts:13-29), so it runs once per write. Read, not run; the adapter's departure says the same (tanstack-db.ts:843-845)." }
  reads.byKey: { verdict: "idiomatic", note: "collection.get per key (tanstack-db.ts:568-576); a keyed get reads the state map, not an index (db/src/collection/index.ts:734-736)." }
  reads.byWindow: { verdict: "idiomatic", note: "Supplied on this row (only the 'off' row declines it, tanstack-db.ts:868-871). group (BasicIndex) and rank (BTreeIndex) on the read binding's backing collection (tanstack-db.ts:522-525). paged.utils.setWindow({ offset, limit }) (tanstack-db.ts:579-587) moves the top-K window (db/src/query/live/collection-config-builder.ts:299-410) and returns true when no subset load was started (collection-config-builder.ts:392-396); a window that needs rows not yet loaded is filled through the lazy load the rank index serves. The binding throws if setWindow ever returns a promise." }
  reads.byTwoAxes: { verdict: "idiomatic", note: "q.fn.where inside the pipeline (tanstack-db.ts:542-555); the library decides when view B changes." }
  reads.bySwitch: { verdict: "idiomatic", note: "A new paged live query over the new group, the old one unsubscribed and cleaned up, marked by its own includeInitialState snapshot (tanstack-db.ts:527-540, 589-594). The new query's orderBy finds the same rank index, so its first window lazy-loads instead of loading the group." }
  relations: { verdict: "idiomatic", note: "As on tanstack-db (tanstack-db.ts:622-753), with a BTreeIndex on owner id and on pair key (tanstack-db.ts:629-632), the columns the two relation live queries filter on with inArray (tanstack-db.ts:646-658). The rows collection carries none: no relation query reads it." }
  single: { verdict: "idiomatic", note: "A row per value and subscribeChanges narrowed by where eq(row.id, …) (tanstack-db.ts:785-812). No index: neither subscription reads initial state, so one would be maintained on every write and read by nothing; the departure says so (tanstack-db.ts:926-927)." }
improvements: []
---

## Version

`version` is `0.15.0` (adapters/tanstack-db.ts:864, through `adapterWith`; the export
is tanstack-db.ts:919-932) and `node_modules/@tanstack/db/package.json` declares
`0.15.0`; `@tanstack/db-ivm` is installed at `0.2.0`. The row is registered in
`src/harness/registry.ts:41`.

## Relation to tanstack-db

The three rows share every builder; the only argument is `TIndexing`
(tanstack-db.ts:60-69), and this row is `'explicit'`. `autoIndex` is `'off'`
(`autoIndexOf`, tanstack-db.ts:62-63), so nothing is minted by a subscription or a
compile; every index on this row is a `createIndex` call made at bind, before the first
live query, and so built over an empty collection and maintained by the load. Everything
on the `tanstack-db` card about the sync write path, the frame, the partial merge, the
`deepEquals` value check, delivery under the publication context, the chain and diamond
shapes, the switch, the churn read fold and the code volume applies here unchanged and is
not repeated, beyond the `createIndex` calls each wiring adds. The one wiring that
differs in kind is `reads.byWindow`: declined on `tanstack-db`, supplied here.

## What the library documents, and what this row follows

- The type docs: `autoIndex` `"off"` is the default, "No automatic indexing (default).
  Use explicit indexes for better bundle size." (db/src/types.ts:785-794).
- The orderBy warning: "Consider creating an index on the collection with
  collection.createIndex((row) => row.rank) or enable auto-indexing with autoIndex:
  'eager' and a defaultIndexType." (db/src/query/compiler/order-by.ts:211-220). This row
  is the first remedy; `tanstack-db-eager` is the second.
- `createIndex` takes an expression callback and `{ indexType }`, falling back to the
  collection's `defaultIndexType` and throwing when neither is set
  (db/src/collection/indexes.ts:284-300). The adapter passes `BTreeIndex` as the default
  (tanstack-db.ts:125) and names `indexType` on every explicit index, so the default
  decides nothing on this row.
- Index type: `BasicIndex` is "Map + sorted Array … O(n) updates to maintain sort order
  … Use BTreeIndex for write-heavy workloads with large collections"
  (db/src/indexes/basic-index.ts:28-36). `group` has fifty distinct values, so a sorted
  array of them is cheap and `BasicIndex` is kept; `rank` and `id` have one value per
  row and the scripts write rank, so they get `BTreeIndex`. Both index types skip the
  bucket and tree work when an update leaves the indexed value unchanged
  (btree-index.ts:109-131, basic-index.ts:148-169), but each still evaluates the index
  expression twice and moves a per-domain counter (base-index.ts:277-293), so a label or
  note write pays that per index.
- Which fields: the ones a live query of that wiring filters on, and the first order
  key, because the orderBy compiler consults an index only for the first one
  (order-by.ts:180-207). Fields nothing reads (the rows collection under relations, the
  values collection under single) get no index; the read binding indexes group and rank
  but not id, since its only id access is a keyed get (tanstack-db.ts:522-525); the
  window binding indexes id only once `pin` builds queries that filter on it.

## Hoisting

Nothing is hoisted beyond what `tanstack-db` hoists: an index is the library's own
structure, built and maintained by it.

## Not determined

- That the explicit `rank` index matches the orderBy's compare options and direction
  (`matchesCompareOptions` / `matchesDirection`, db/src/indexes/base-index.ts:321-370,
  utils/index-optimization.ts:58-67; the query side from `buildCompareOptions`,
  order-by.ts:394), so the warning is silenced and lazy loading used; both default to
  `DEFAULT_COMPARE_OPTIONS` by reading, not run.
- That the live query's initial load of an `inArray` / `eq` on `id` goes through the id
  index rather than a scan; read from `requestSnapshot` passing its `whereExpression` to
  `currentStateAsChanges` (db/src/collection/subscription.ts:1181-1270), not traced
  further, not run.
- Whether BasicIndex or BTreeIndex is the faster choice for `group` under the move
  scripts; chosen from the library's own guidance, not measured.
- The diamond running once per write; derived from the scheduler source, not run.
- Time effects of every choice on this card. Nothing was run.
