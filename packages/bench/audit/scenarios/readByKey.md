---
scenario: "readByKey"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "d5e9da79c2970a24"
verdict: "narrow"
models: "Rendering a list from an array of ids against a normalised store: for each id, fetch the entity and render three of its fields. Eight pages of 32 ids, strided through 10,000 rows."
measures: "The store's key-to-entity lookup and field reads, untracked, plus one 32-line delivery per page; nothing is written and nothing settles."
favours:
  - "Stores whose lookup is one hash probe returning a plain object (Map-backed stores; both anchors do one `byId.get` per key, `adapters/baseline-array.ts:357-365`, `adapters/baseline-array-indexed.ts:334-342`) over stores that return proxies, enrich rows, or allocate per read. tanstack-db's keyed read is `collection.get` on the backing collection (`adapters/tanstack-db.ts:830-838`), which returns the row through `getWithVirtualProps` (`node_modules/@tanstack/db/dist/esm/collection/index.js:339-341`, `state.js:137-163`): a virtual-props record per call and an enriched copy cached per key."
  - "TinyBase is read as two `getCell` calls per key and a fresh row object per key (`adapters/tinybase.ts:907-924`); that is the adapter's reading of the library's cell API, not the script's."
biases:
  - "The read happens outside any tracking context. In an application the same read occurs inside a component render or a computed and registers a dependency; signal and proxy stores pay that tracking cost there and do not pay it here. Toward fine-grained reactive stores relative to how they would fare on a tracked read."
  - "The ban on resolving keys before the clock (`types.ts:141-143`, `scenarios.ts:4299-4303`) is a rule in prose; no check detects an adapter that kept handles from bind time. Compliance of all adapters is unverified by this card (oimdb `adapters/oimdb.ts:823-831`, mobx `adapters/mobx.ts:578-586`, tanstack-db, tinybase, lokijs `adapters/lokijs.ts:599-607` and both anchors comply)."
  - "A 32-line delivery per page is a large share of a step whose store work is 32 map probes; `consumerFloor` is the floor here (`floor.ts:86, 95`), so the multiple column is the reading to use."
  - "Strided keys (`dataset.ts:902-905`) defeat contiguous layouts; a real id list is often in insertion or sort order, which would favour array-backed stores. Toward hash stores, mildly."
summary: "Untracked lookup of 32 rows by key per page out of 10,000; it prices raw keyed access and delivery, not the tracked read an application's render performs."
---

## The script

`scenarios.ts:4295-4353`: `READ_PAGES` = 8 (`dataset.ts:194`) steps, each
`read.readKeys(page * WINDOW, WINDOW)` (`:4330-4335`). Keys are a stride over the
population (`dataset.ts:902-905`; at n = 10,000 and 256 keys the stride is 39). `check`
(`:4342-4346`) demands exactly 8 deliveries and 8 distinct states of 32 rows on view A and
zero DELIVERIES on view B; `oracle` reads the same keys out of its own Map (`:4347-4352`,
`oracle.ts:379-388`), rendering a missing key as an empty line so a lost row fails rather than
shortens.

## Representativeness

Fetching entities by id is among the most frequent store reads in a front-end, and 32 is a
plausible visible-page size. The narrowing is that the read is a bare pull: no subscription is
formed, so what most reactive stores spend on a read in practice (dependency registration) is
absent. js-framework-benchmark has no store-level equivalent; js-reactivity-benchmark measures
signal reads only inside computations. This row is useful as a raw-access baseline and should
not be read as "render cost of a list".

## Standing (READ_SCRIPT, `scenarios.ts:315-386`)

- A1 MET (`:316-322`) depends on the no-pre-resolution rule, which nothing enforces in code
  (see biases).
- A2 MET (`:323-327`) speaks of "the scroll waking view B" — that is scrollWindow's property;
  for this script `check` demands zero deliveries on view B (`:4346`), so no redundant count
  can arise and a wake there is a failure.
- A4 MET (`:333-337`) holds here: this script does assert an exact delivery count (`:4343`).
- B2 MET (`:343-346`) holds: both anchors do one `Map.get` per key.
- B3 MET (`:347-351`): no adapter declines `reads.byKey`. tanstack-db's plain row declines
  `reads.byWindow` while supplying this shape (`adapters/tanstack-db.ts:1386-1389`), which is
  the per-shape declaration the item describes; its falsifier names "a second library admitted
  that can answer one read shape and not another", and whether that row is what it means is
  not settled by the code.
- C5 NOT MET (`:375-385`) holds: `control-write` declines every read shape
  (`harness/control.ts:1265-1271`).
