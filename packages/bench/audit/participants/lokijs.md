---
participant: "lokijs"
version: "1.5.12"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "0ea5b75fb7888802"
verdict: "idiomatic"
summary: "LokiJS DynamicViews over one collection, each delivered only when LokiJS itself dirtied it (performSortPhase emits 'rebuild' synchronously for a dirty view and returns at once for a clean one); collections run with the documented disableMeta; LokiJS has no notification batch, so a frame runs its writes directly; a view switch replaces the paged view's group filter by its uid; the column, chain and diamond churn shapes are declined."
wirings:
  bind: { verdict: "idiomatic", note: "One DynamicView per view, applyFind({group}) plus applySortCriteria (adapters/lokijs.ts:111-125), each wrapped by a 'rebuild' listener (lokijs.ts:80-86). settle calls performSortPhase() on every view (lokijs.ts:89-93, 168-174): it returns at once when neither sortDirty nor resultsdirty is set (node_modules/lokijs/src/lokijs.js:4711-4715) and otherwise re-sorts and emits 'rebuild' (lokijs.js:4737-4739), and only then is data() read and delivered. A view is dirtied only when the written document was or becomes part of it (lokijs.js:4780-4783), so a write to group A does not redeliver view B. The re-sort per settled step is the library's passive design under a per-step settle; declared in departure (lokijs.ts:986-997)." }
  bindPerGroup: { verdict: "idiomatic", note: "The same body with fifty DynamicViews (lokijs.ts:1053); a write dirties one view (two on a move), so one or two of the fifty are re-sorted and delivered per settle." }
  frame: { verdict: "idiomatic", note: "frame runs its writes directly (lokijs.ts:95-96, used at 248, 412, 620, 843, 960). LokiJS has no notification batch: Collection.startTransaction only snapshots data and indexes for rollback when the collection is transactional (lokijs.js:7095-7107), and the emitter calls every listener synchronously per event (lokijs.js:831-850). A passive view already coalesces a frame's writes into one re-sort at the next settle; the churn, relation and single listeners fire once per write. Declared in departure (lokijs.ts:991-992)." }
  churn.row: { verdict: "idiomatic", note: "LokiJS has no per-document subscription; each subscriber is a collection 'update'/'delete' listener that tests the document id and reads the label off the emitted document (lokijs.ts:350-354, 443-452). Every subscriber runs on every write. Each read is stored per slot and cleared on unmount (lokijs.ts:449, 451, 481), which is what the verify pass's read fold checks. Declared in departure (lokijs.ts:993-995)." }
  churn.wide: { verdict: "idiomatic", note: "One listener testing membership in a Set of the sources and reading every source through the unique index, keeping the first one's label (lokijs.ts:454-470), which is what churnWide's model expects every subscriber to read (scenarios.ts:2149-2154)." }
  churn.column: { verdict: "declined", note: "Declined by the adapter (lokijs.ts:472, reason at 1010-1017), and the reason holds in the library: update is document-level and, with clone off and the delta changes API at its default (disabled), the emitted old document is the same object as the new one (lokijs.js:6058, 6062, 6126), so LokiJS cannot say which field moved. A cloned collection (clone: true) would make the emitted old document a distinct object, but the subscriber would then be comparing old and new labels itself, which B3 of churnColumn (scenarios.ts:2160) forbids." }
  churn.chain: { verdict: "declined", note: "Declined by the adapter (lokijs.ts:473, reason at 1018-1025): a DynamicView cannot take another view as its source and the collection emitter has no per-source channel, and LokiJS has no derived-value primitive, so a chain could only be the wide listener with the depth levels re-run by hand in its body, which B3 of churnChain (scenarios.ts:2279) forbids. Removes lokijs from churnChain and chainFrameWrite." }
  churn.diamond: { verdict: "declined", note: "Declined by the adapter (lokijs.ts:474, reason at 1026-1033): LokiJS's derived structures are DynamicViews and Resultsets, filtered and sorted lists over one collection, and nothing computes a value from two others; the branches and the join could only be functions the adapter calls by hand inside a collection listener, which the contract forbids." }
  reads.byKey: { verdict: "idiomatic", note: "by('id', key) per key, a hash hit on the unique index (lokijs.ts:599-607; lokijs.js:7003-7017, UniqueIndex.get 7559-7561)." }
  reads.byWindow: { verdict: "idiomatic", note: "scrollTo sets a number (lokijs.ts:611-614) and settle slices the view's sorted list (lokijs.ts:622-624). The paged view is persistent (lokijs.ts:510-513), so a clean read returns the maintained resultdata instead of copying the group (lokijs.js:4653-4661)." }
  reads.byTwoAxes: { verdict: "idiomatic", note: "applyWhere for the axis inside the view's pipeline (lokijs.ts:521-531). View B is delivered only when performSortPhase reports it rebuilt (lokijs.ts:625-627), so a document its applyWhere excludes before and after does not wake it (lokijs.js:4780-4783). The view is not persistent: no script scrolls view B, so it is read only when dirty, where a persistent view copies just the same (performSortPhase, lokijs.js:4730-4734) and keeps resultdata in step on every write besides; see lokijs.md." }
  reads.bySwitch: { verdict: "idiomatic", note: "The paged view's group filter is registered with a uid (lokijs.ts:497, 514); switchGroup resets the offset and calls applyFind({group}, uid) with the new group (lokijs.ts:616-619). applyFilter replaces the pipeline entry with that uid and calls reapplyFilters (lokijs.js:4533-4545), which resets the Resultset, re-runs the find over the whole collection, empties resultdata and queues the sort (lokijs.js:4496-4523); the next settle's performSortPhase re-sorts and emits 'rebuild', and the view is delivered at offset 0. View B is untouched. This is LokiJS's own way to change a DynamicView's filter. The viewSwitch script writes nothing between switches (scenarios.ts:4535-4554), so every step is this re-filter alone." }
  relations: { verdict: "idiomatic", note: "Three collections, each view re-read only when its own collection emitted (lokijs.ts:791-823, 845-854); writePair composes the key and probes the unique index on it per call (lokijs.ts:834-842)." }
  single: { verdict: "idiomatic", note: "One collection, two listeners on 'update' each testing the document id (lokijs.ts:923-948); LokiJS has no scalar and no per-document listener. LokiJS compares no values, so an equal write wakes the subscriber." }
improvements:
  - "A binary index on group (ensureIndex / indices: ['group']) on the read binding's collection (lokijs.ts:508) would be consulted by the switch's fresh find (Resultset.find checks indices only while filterInitialized is false, lokijs.js:3547-3549), moving bySwitch from a whole-collection scan to an index range. It is a trade-off, not a fix: the index is maintained on every write of every read script and is read by none of the others (src/adapters/lokijs.md). Not done; a consumer of this table would pick it only for a switch-heavy workload."
---

## Version

`version` is `1.5.12` (adapters/lokijs.ts:984) and
`node_modules/lokijs/package.json` declares `1.5.12`. The code read is
`node_modules/lokijs/src/lokijs.js`.

## What LokiJS documents and what the adapter does

The cited recipe is the DynamicView (techfort.github.io/LokiJS/DynamicView.html): a
filter pipeline and a sort registered once, re-evaluated per document as writes land.

- **Writes.** The adapter mutates the stored document and hands it back to `update`,
  the documented idiom with cloning off (the collection default, lokijs.js:5021). The
  upsert is `by('id')` then batched `insert`/`update`; `update(array)` loops
  `update(doc)` (lokijs.js:6012-6037). LokiJS compares no values: every `update` re-runs
  every DynamicView's `evaluateDocument` (lokijs.js:6079-6081), whose `indexOf` over the
  view's `filteredrows` is linear in the group (lokijs.js:4765). That cost is the
  library's.
- **Collections.** Every collection is created with `{ unique: [key], disableMeta: true }`
  (lokijs.ts:73-76). `disableMeta` is a documented collection option (lokijs.js:4946,
  5030) that skips the `meta` stamp, a `Date` and two field writes per update
  (lokijs.js:5238-5248); it requires the changes API off and no TTL (lokijs.js:1175-1184),
  which is this configuration.
- **Views.** `applyFind({ group })` plus
  `applySortCriteria([['rank', false], ['id', false]])`. The sort runs in
  `performSortPhase` through `compoundsort` (lokijs.js:4711-4743, 3321). No binary index
  is built; `src/adapters/lokijs.md` argues that the views are fed through
  `evaluateDocument`, which runs the pipeline over a one-element Resultset with
  `filterInitialized` already true, and `find` consults an index only when
  `filterInitialized` is false (lokijs.js:3547-3549, 4770-4777). The source agrees. The
  view switch is the exception (see `improvements`).
- **Signal.** LokiJS's own per-view signal is the `rebuild` event. On a passive sorted
  view a write calls `queueSortPhase`, which marks `sortDirty` and queues a `setTimeout`
  that emits `rebuild` later (lokijs.js:4687-4705, 4667-4680). The harness never yields,
  so that timer never fires inside a measurement. `settle` calls `performSortPhase()`
  instead, which emits `rebuild` synchronously when the view was dirty and returns
  early otherwise (lokijs.js:4711-4739). The listener's flag is cleared immediately
  before each call (lokijs.ts:89-93), so a timer that did fire between settles cannot
  cause a delivery; nothing depends on it firing.
- **Frame.** See the `frame` wiring: there is no API that defers notification across
  writes, so `frame` is a direct call (lokijs.ts:96).
- **View switch.** `applyFind(query, uid)` is documented as "Adds or updates a
  mongo-style query option in the DynamicView filter pipeline" (lokijs.js:4566-4573);
  with a uid already in the pipeline it replaces that entry and re-applies every filter
  (lokijs.js:4533-4545, 4496-4523). The reset Resultset runs a fresh find over the
  collection, so a switch costs a scan of the population plus a re-sort of the new
  group; that is the library's price for changing a view's definition.

## Declared departures, checked

- Collection-wide subscription on the churn rows: LokiJS's emitter has no per-document
  channel (lokijs.js:831-850), so every subscriber runs on every write
  (lokijs.ts:350-354). Declared (lokijs.ts:993-995).
- `churn.column`, `churn.chain` and `churn.diamond` declined, with reasons in the
  adapter (lokijs.ts:1009-1034). For the column: `update` emits `(returnObj, oldInternal)`
  (lokijs.js:6126); with cloning off `newInternal` is the document passed in
  (lokijs.js:6062) and `oldInternal` is the stored reference (lokijs.js:6058), the same
  object when the caller mutated it in place.
- The cell wiring after `pin` has no DynamicView, so it is driven by the collection
  emitter's flag (lokijs.ts:132-141, 176-180).

## Churn read fold

Every supplied churn mount stores its subscriber's read per slot at mount and in the
body and clears it on unmount (lokijs.ts:441, 449, 451, 468, 470, 481), so the verify
pass's fold over every standing subscriber (harness/render.ts:124-141) checks each one's
own source. Scripts on the declined shapes have no lokijs row.

## Hoisting

`pin` resolves the pinned documents once through the unique index (lokijs.ts:254-269)
and `holdRelation` resolves owner and pair documents once (lokijs.ts:791-823) — handles,
not values. `holdChurnRows` resolves nothing; every read in a churn body is either the
emitted document or a `by` lookup. `readKeys` resolves nothing in advance
(lokijs.ts:599-607).

## Not determined

- Whether the per-view delivery keeps every digest unchanged. By the reading above it
  only removes deliveries of views LokiJS left clean, whose text equals the previous
  one; not run.
- The persistent paged view's correctness under removals rests on `removeDocument`
  keeping `resultdata` aligned with `filteredrows` (lokijs.js:4878-4896); read, not run.
- That `reapplyFilters` on a persistent view leaves `resultdata` equal to the switched
  group's sorted rows after the next `performSortPhase` (lokijs.js:4496-4523,
  4730-4734); read, not run.
- Time effects of every claim on this card.
