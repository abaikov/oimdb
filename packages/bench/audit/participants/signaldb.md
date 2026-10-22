---
participant: "signaldb"
version: "1.8.1"
auditedAt: "2026-10-21"
auditedBy: "claude-opus-5-5 (churn.chain, churn.diamond, summary and Version re-read 2026-10-21; other wirings from 2026-10-17, their line numbers not re-checked; nothing run)"
digest: "246a087c0a5d1d19"
verdict: "idiomatic"
summary: "SignalDB's framework-free recipe (Collection with a group index, one sorted and limited find cursor per view, observeChanges as the signal, collection.batch per frame); the library's own per-write costs dominate. The keyed read is one find({id: {$in: page}}) per page through the id provider, and a scroll and a view switch each build a new cursor. SignalDB has no derivation primitive, so the chain and diamond shapes bridge a cursor's observeChanges into @preact/signals-core signals and derive through its computed: the derivation is a second library's, not SignalDB's."
wirings:
  bind:
    verdict: "idiomatic"
    note: "Collection with createIndex('group') (adapters/signaldb.ts:87-89), one find({group}, {sort: {rank: 1, id: 1}, limit}) per view observed with all four callbacks and skipInitial (signaldb.ts:120-144). Writes are updateOne $set per patch (signaldb.ts:245-256) and insert/updateOne inside collection.batch for write/remove (signaldb.ts:214-244); frame is the same collection.batch around the script's writes (signaldb.ts:110, 257), opened once because batch does not nest (createBatchFrame 32-46; node_modules/@signaldb/core/dist/index23.mjs:560-567). Inside a frame the index rebuild and every cursor's requery wait for the frame's end (index23.mjs:391-394, 510-517). Each updateOne copies the memory array and, outside a batch, rebuilds every index over the whole collection (index23.mjs:422-427, 447-449, 391-403, 619-643); that is the library. The settle fetches each pending cursor again because the observer keeps its window private (signaldb.ts:307-318). The adapter-side `written` Set (signaldb.ts:109) holds ids to choose insert over updateOne; disclosed in departure and admission (signaldb.ts:1140-1155)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty cursors (signaldb.ts:1194); every write requeries all fifty (index23.mjs:510-527), which is SignalDB's model, once per frame inside a frame."
  churn.row:
    verdict: "idiomatic"
    note: "find({id}) plus observeChanges({added, changed}, false) per subscriber (signaldb.ts:506-530): the mount label comes from `added` on the observer's first run, the one getItems registration already performs (index10.mjs:139-142, index9.mjs:56-104), and a wake reads row `from`'s label off the document `changed` carries; `added` only reads, so a mount is not a wake. unmount stops the observer and cleans up the cursor (561-568). The read is the one the churn read fold expects of each slot (churnList mounts slot `at` on row `at`, scenarios.ts:2279). No group index in this wiring, since no churn cursor selects on group. frame is collection.batch (422, 470)."
  churn.wide:
    verdict: "idiomatic"
    note: "One find({id: {$in: ids}}) cursor per subscriber, the same body as churn.row (signaldb.ts:506-530), SignalDB's way to observe many documents; the $in resolves through the id provider registered at construction (index23.mjs:151; index22.mjs:12-42). The body keeps the first source's label, the one value the line renders, out of the documents `added` and `changed` carry, and counts a wake on every `changed`; no findOne and no second memory-array copy per wake. Declared in departure (1146-1148)."
  churn.column:
    verdict: "idiomatic"
    note: "find({id}, {fields: {label: 1}}) with the same added/changed pair (signaldb.ts:531-553): the observer diffs the projected document (index10.mjs:72-88, index9.mjs:56-80), so a note write produces no changed call. A column identity built from the library's own diff."
  churn.chain:
    verdict: "idiomatic"
    note: "Supplied: churnShapes is called with no declines (signaldb.ts:1233). mountDerived (signaldb.ts:442-477) builds one find({id: {$in: ids}}) cursor over the subscriber's `count` roots and observes it with added/changed both writing the row's label into that root's @preact/signals-core signal (447-459); mountOnChain (601-616) stacks `depth` computeds over those signals, level 1 joining the labels and applying chainLevelOf, each level above applying chainLevelOf to the computed below. One preact `effect` reads the head (462-470): its first run is the mount read and every later run counts a wake. The derivation is a library primitive, preact's computed (@preact/signals-core 1.14.4, packages/bench/package.json:34), not SignalDB's, because @signaldb/core exports none; the bridge from observeChanges into signals is the documented no-reactivity-adapter route, and signaldb.md (45-63) says why SignalDB's own reactivity adapter is not used. B3 of churnChain (scenarios.ts:2279-2283): the adapter does not walk the chain to find roots; it hands the root ids it was told (`from`, `count`) to one cursor, as every wiring does, and preact tracks each computed's dependency. B3 of chainFrameWrite (2374-2377): nothing caches the head between frames; each write re-runs the computeds below the effect. A note write reaches `changed` and rewrites the signal with an equal string, which preact's equality check stops. unmount (632-639) stops the effect, stops the observer and cleans the cursor up. Not run."
  churn.diamond:
    verdict: "idiomatic"
    note: "Supplied (signaldb.ts:1233). mountOnDiamond (617-627) uses the same bridge with a find({id}) cursor over the root (mountDerived, 442-477) and builds two preact computeds, diamondLeftOf and diamondRightOf of the root signal, and a third computed joining them with diamondJoinOf. The effect reads the join (462-470) and counts a wake on every run after the first; nothing in the adapter compares or deduplicates. Glitch-freedom is preact's: a signal write marks the computeds and the effect, and the join is re-evaluated once when the effect pulls it. B3 of churnDiamond and diamondFrameWrite (scenarios.ts:2489-2492, 2571-2574): the join is a library computed and the wake is the library effect's run, so neither clause is touched. Not run."
  reads.byKey:
    verdict: "idiomatic"
    note: "One find({id: {$in: page}}).fetch() per page (signaldb.ts:703-708), applied under the ruling that a per-page $in is the library's lookup. getIndexInfo sends a non-scalar id selector to the index providers (index23.mjs:404-420); the first provider is the id index registered at construction (index23.mjs:151), and createExternalIndex resolves $in key by key in the order given (index21.mjs:28-29, index22.mjs:12-42), so positions come back in the page's key order, the id drops out of the residual selector and getItems returns them without a match pass (index23.mjs:458-476). One memory-array copy per page, where the findOne per key it replaces paid one per key (index23.mjs:545-554, 447-449). Nothing is resolved in advance."
  reads.byWindow:
    verdict: "idiomatic"
    note: "skip is fixed at cursor construction (pagedCursorOf, signaldb.ts:610-614), so scrollTo stops and cleans up the old cursor and observes a new one at the new skip (repointPaged 630-636, scrollTo 714-717). That is SignalDB's model. frame is collection.batch (606, 697)."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "Both predicates are in the selector, the axis as $regex '[02468][0-9][0-9]$' on id (signaldb.ts:642-658); onSecondAxis tests the evenness of the third-from-last character's code (dataset.ts:393-394), which for a digit is the digit's evenness, and every dataset id ends in seven digits (dataset.ts:437, 910, 930, 959), so the two agree on every row."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "A cursor takes its selector at construction, so switchGroup sets the paged group, resets the offset and goes through the same repoint scrollTo uses: stop and clean up the old cursor, observe a new find({group}, {sort, skip: 0, limit}) and mark it (pagedGroup 609, repointPaged 630-636, switchGroup 718-722). The settle delivers it as it delivers a scroll (723-732). View B's cursor is untouched and not marked, so viewSwitch's view-B check is met with no redundant delivery. Not run."
  relations:
    verdict: "idiomatic"
    note: "Three collections and two observed $in cursors, one per view (holdRelation, signaldb.ts:916-967). Each render is one fetch of the cursor its view observes, placed by an id-to-lines map built in holdRelation (maps 822-823, filled 929-932; renders 833-855), the pattern the cell wiring uses. frame batches the owners and pairs collections, the two the relation scripts write (803-806, 894); the row collection is left out because closing a batch rebuilds that collection's whole id index (index23.mjs:396-403)."
  single:
    verdict: "idiomatic"
    note: "A document per value and a find({id}) cursor per value (signaldb.ts:1061-1134), declared as the nearest thing SignalDB has to a scalar; frame is collection.batch (1115). dispose stops the observers and calls collection.dispose() (1128-1132)."
improvements: []
---

## Version

`node_modules/@signaldb/core/package.json:3` (repository root) is `1.8.1`, equal to the adapter's
`version` (`packages/bench/src/adapters/signaldb.ts:1209`). There is no copy under
`packages/bench/node_modules`. SignalDB was not among the 2026-10-17 upgrades, and the `dist`
lines cited here were re-read against the installed build.

## What the documentation says and what the adapter does

The adapter cites the Collection reference and the indexes guide (`docs`, signaldb.ts:1210). It installs no
reactivity adapter (`departure`, signaldb.ts:1211-1223), so `Cursor.depend` returns at
once and `observeChanges` is the documented signal. Each view is a sorted, limited cursor
(signaldb.ts:120-144); `Cursor.getItems` applies sort, skip and limit in that order
(`dist/index10.mjs:72-88`), so the window is SignalDB's own. Every collection event
requeries every observed cursor, deferred to the end of a `batch` when one is open
(`dist/index23.mjs:510-527`), and the observer diffs the new list against the last one
(`dist/index9.mjs:56-90`), which is also what makes `resendUnchanged` wake nobody.

## Frame

`frame` runs the script's writes inside `collection.batch` (index23.mjs:560-567).
`batch` sets a flag, runs the callback, clears the flag, rebuilds every index and runs
the deferred requeries, which are a Set, so each cursor re-derives once per frame. It
does not nest: an inner `batch` clears the flag and flushes before the outer callback
returns. `createBatchFrame` (signaldb.ts:32-46) therefore opens the batch once per frame
and runs a nested call (`write` or `remove` inside a frame) directly in the open one.
Outside a frame `write` and `remove` open their own batch, and a single patch is an
unbatched `updateOne`.

## The keyed read

The ruling that one `$in` query per page is the library's lookup is applied
(signaldb.ts:703-708). It is the fast form only because of the id provider SignalDB
registers on every collection (index23.mjs:151): without a provider for the field, a
non-scalar selector falls to `memory.filter(match)` (index23.mjs:468-470), and `match`
builds a mingo `Query` per document (index12.mjs:11-12). With it, the page is resolved
by `idIndex` lookups in key order. `getIndexInfo` answers unmatched while
`indicesOutdated` is set, which happens only inside a batch (index23.mjs:391-394,
415-419); no read script calls `readKeys` inside a frame.

## Where it differs, and in whose favour

- **The `written` Set** (signaldb.ts:109) is the one piece of bookkeeping the adapter
  keeps. It holds ids only and decides insert versus update; `WHY-EACH-ROW.md` ("batch
  insert — signaldb, figure retracted until re-measured") records that the upsert path
  is quadratic on a load (`dist/index23.mjs:422-430`) and that `insert` still scans
  once per row (`:584`); no figure for the current wiring has been measured. For a load into an empty store this is what
  `insertMany` does (`:598-609`). For a write of a row already present it routes to
  `updateOne`, the same call upsert would make.
- **Per-write costs that are the library's:** `updateOne` copies the memory array and,
  outside a batch, rebuilds the id index and every index provider over the whole
  collection (`:391-403`, `:619-643`).
- **Scroll and switch build cursors.** Both cost a cursor construction, an observer and
  one full `getItems` (the observer's initial `runChecks`, index10.mjs `observeRawChanges`)
  plus the settle's `fetch`; that is SignalDB's model of a query, not an adapter choice.

## Not verified

- No figure in this card was measured; directions are from operation counts in the
  shipped build.
- That `updateOne` by `{ id }` inside a batch, after a `removeOne` earlier in the same
  batch, resolves through the shifted id index (`deleteFromIdIndex`, index23.mjs:437-443)
  to the right position; read, not run.
- That `find({ id: { $in } })` returns the page in key order in every read script: read
  from `createExternalIndex` (index22.mjs:12-42) and the order-preserving `Set` in
  `getMergedIndexInfo` (index18.mjs), not run. A page whose key is absent comes back
  short, which fails the digest rather than passing.
- The viewSwitch check was read against this wiring, not executed.
