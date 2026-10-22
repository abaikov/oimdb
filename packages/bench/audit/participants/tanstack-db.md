---
participant: "tanstack-db"
version: "0.15.0"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "7bb7122c7d2fb816"
verdict: "idiomatic"
summary: "TanStack DB 0.15 on its default autoIndex 'off', written through the sync interface (one sync transaction per frame) and read through live queries and subscribeChanges; chain and diamond are live queries over live queries deriving with fn.select, and a view switch builds a new live query. A scroll on this row builds a new paged live query at the new offset, because an unindexed setWindow returns a promise in 0.15; the indexed rows move the window with setWindow. In 0.15 a committed batch is published inside a scheduler context, so the diamond's join runs once per write on the sync path too, which is what the adapter's departure string now says."
wirings:
  bind: { verdict: "idiomatic", note: "One createLiveQueryCollection per view, where(group).orderBy(rank).orderBy(id).limit(window).select(id, rank, label), subscribed with subscribeChanges and includeInitialState false through `watchChanges` (adapters/tanstack-db.ts:227-245, 193-199); delivery from live.toArray in settle (tanstack-db.ts:299-311). A note write yields a projected row deepEqual to the previous one and the commit pushes no event for it (node_modules/@tanstack/db/src/collection/state.ts:1392-1402). After pin, two projected live queries over the pinned ids, one selecting label and one note, each drive their own consumer (tanstack-db.ts:253-292), so a write wakes only its column; each cell is read back with live.get(id) per pinned id (tanstack-db.ts:270-273)." }
  bindPerGroup: { verdict: "idiomatic", note: "The same body handed fifty views (tanstack-db.ts:891): fifty ordered, limited, projected live queries over one backing collection." }
  frame: { verdict: "idiomatic", note: "frame is one sync transaction per collection the frame's writes reach: the first write on a collection inside a frame calls begin and every later one joins it; the frame's end commits each opened one (tanstack-db.ts:77-106). Outside a frame each write call is its own begin/write/commit, committed before the call returns; no transaction is held open until settle, the same reading of an unframed write tinybase.ts follows with one store.transaction per call. No script nests a frame, so the frame keeps a flag rather than a depth. The sync interface does not nest: commit takes the last pending transaction (db/src/collection/sync.ts:285-313) and commitPendingTransactions applies only committed ones (state.ts:1060-1120), which is why writes join the open transaction instead of opening their own; the comment at tanstack-db.ts:97 cites sync.ts:285-290." }
  churn.row: { verdict: "idiomatic", note: "subscribeChanges on the backing collection with where eq(row.id, …) and includeInitialState false (tanstack-db.ts:384-401), the documented filtered subscription (db/src/types.ts:1094-1115). The body reads the row back with rows.get and stores it per slot, so the verify pass's per-slot read fold sees each subscriber's own read (tanstack-db.ts:347, 389, 400; harness/render.ts:124-141)." }
  churn.wide: { verdict: "idiomatic", note: "One subscribeChanges with where inArray(row.id, sources) (tanstack-db.ts:393-396). The body reads the first source alone; the dependency set is the where clause, not the reads, so this does not shrink the subscription, and the first source is what churnWide's model expects every subscriber to read (scenarios.ts:2149-2154). Declared in departure (tanstack-db.ts:846-848)." }
  churn.column: { verdict: "idiomatic", note: "A live query per subscriber over the one row with select(id, label) (tanstack-db.ts:402-423): TanStack DB's where filters rows, and a projection is its only column narrowing. A pipeline per subscriber is the price; WHY-EACH-ROW.md (churnColumn) says the same. The body reads the label from the backing collection, not from the live query (tanstack-db.ts:418)." }
  churn.chain: { verdict: "idiomatic", note: "depth live queries built in the mount: level 1 is where inArray(row.id, roots) over the backing collection with fn.select deriving chainLevelOf(label, 1) (tanstack-db.ts:427-438); each level k from 2 is a live query from the one below with fn.select deriving chainLevelOf(text, k) (tanstack-db.ts:442-456). The subscriber is on the head and reads the head's row for root `from` with head.get(id) (tanstack-db.ts:458-468). Every level is cleaned up in the unmount (tanstack-db.ts:352-359); cleanup() returns a promise but retires local state synchronously (db/src/collection/lifecycle.ts:466-480, 512-522). fn.select is the library's functional projection, documented as not optimisable (db/src/query/builder/index.ts:946-985); nothing above level 1 has a where or an orderBy to optimise." }
  churn.diamond: { verdict: "idiomatic", note: "Two live queries over root `from` (where eq(row.id, id), fn.select of diamondLeftOf / diamondRightOf, tanstack-db.ts:472-483) and a third that innerJoins them on id and fn.selects diamondJoinOf(left.text, right.text) (tanstack-db.ts:484-494); the subscriber is on the join and reads its one row (tanstack-db.ts:495-504). All three are cleaned up on unmount. In 0.15 emitEvents publishes every committed batch inside withPublicationContext (db/src/collection/changes.ts:255-283; db/src/scheduler.ts:183-216), and a live query's graph run is scheduled into that context with its source builders as dependencies (db/src/query/live/graph-scheduler.ts:13-29; collection-config-builder.ts:710-736), so the join waits until both branches have run and runs once per write. Read, not run; the adapter's departure says the same (tanstack-db.ts:843-845)." }
  reads.byKey: { verdict: "idiomatic", note: "collection.get per key on the backing collection (tanstack-db.ts:568-576; db/src/collection/index.ts:734-736); nothing resolved in advance." }
  reads.byWindow: { verdict: "idiomatic", note: "With autoIndex off and no index, setWindow in 0.15 starts a subset load and returns a promise (db/src/query/live/collection-config-builder.ts:299-410, the promise branch at 392-410), and the harness never yields. So on this row scrollTo unsubscribes and cleans up the paged live query and builds one at the new offset from the same factory, subscribed with includeInitialState true (tanstack-db.ts:523-536, 575-582), the way switchGroup already did. The indexed rows keep setWindow and throw if it ever returns a promise (tanstack-db.ts:583-590). scrollWindow and deepScroll pass verify on all three rows (2026-10-21), so the rebuilt query's initial snapshot is delivered synchronously. A rebuild per scroll step is the price this row pays, and the departure string says so." }
  reads.byTwoAxes: { verdict: "idiomatic", note: "Second predicate as q.fn.where inside the pipeline (tanstack-db.ts:542-555); a move of a row the predicate excludes produces no output change and no event, so view B is woken only by the library." }
  reads.bySwitch: { verdict: "idiomatic", note: "A live query's where is fixed at construction and setWindow moves offset and limit only, so switchGroup unsubscribes and cleans up the paged live query and builds one over the new group from the same factory (tanstack-db.ts:527-540, 589-594), as useLiveQuery does on a changed dependency. It subscribes with includeInitialState true (tanstack-db.ts:593), whose snapshot requestSnapshot publishes synchronously (db/src/collection/changes.ts:349-355; db/src/collection/subscription.ts:1181-1310), and that is the mark the settle delivers at offset 0. View B is untouched. On this unindexed row the new query loads the whole group; whether that load is synchronous in 0.15 when setWindow's is not was not settled." }
  relations: { verdict: "idiomatic", note: "Three collections on the sync interface; owner and pair live queries via inArray (tanstack-db.ts:646-658); pair records committed before either query exists (tanstack-db.ts:685-704); each line is read back with live.get(owner id) or live.get(pair key) (tanstack-db.ts:662-669); writePair composes the key per call (tanstack-db.ts:713-719). A frame opens a sync transaction only on the collections its writes reach (tanstack-db.ts:77-106)." }
  single: { verdict: "idiomatic", note: "TanStack DB has no scalar; one row per value in a collection and a subscribeChanges narrowed by where eq(row.id, name) (tanstack-db.ts:785-812). An equal re-write is dropped by the library's deepEquals at commit (state.ts:1392-1402)." }
improvements: []
---

## Version

`version` is `0.15.0` (adapters/tanstack-db.ts:864, through `adapterWith`) and
`node_modules/@tanstack/db/package.json` declares `0.15.0`. The adapter also runs
`@tanstack/db-ivm`, installed at `0.2.0`. Source read:
`node_modules/@tanstack/db/src` and `node_modules/@tanstack/db-ivm/src`.

## What the library documents and what the adapter does

The cited recipe is the collection-options-creator guide: a collection whose `sync`
function receives `begin`/`write`/`commit`/`markReady` (`syncedCollectionOf`,
tanstack-db.ts:110-138). The three registered rows share every builder and differ by one
argument, `TIndexing` (tanstack-db.ts:60-69); this row is `'off'`.

- **Write path — the caveat on every number of these three rows.** No write goes
  through `collection.insert/update/delete`, the API an application calls; every
  write is a message on the sync handles a collection-options creator receives
  (`rowsStoreOf`, tanstack-db.ts:145-180), so the optimistic path is never entered and
  nothing here prices it. The optimistic
  path resolves `isPersisted` from the transaction machinery
  (db/src/collection/mutations.ts:229), and `localOnlyCollectionOptions` confirms its
  optimistic writes through the same sync `write` (`confirmOperationsSync`,
  db/src/local-only.ts:209-210, 375-400). Declared in `departure`
  (tanstack-db.ts:836-848).
- **Frame.** See the `frame` wiring: one sync transaction per collection reached
  (tanstack-db.ts:77-106). The upsert's `rows.has` sees visible state, so a frame that
  deletes and re-writes a row sends an `update`; the pending projection merges it onto
  the staged deletion (`{ ...undefined, ...value }`, db/src/collection/state.ts:936-942)
  and the commit does the same onto the deleted key (state.ts:1262-1266), so the full row
  sent by `write` is what is stored. An `insert` over an existing key throws unless it is
  deepEqual to the current value (state.ts:900-914).
- **Partial updates.** `rowUpdateMode: 'partial'` spreads the message onto the stored row
  into a fresh object (state.ts:1262-1266), so a one-column patch is sent as one column
  and the harness's object is not retained on update. Inserts are copied by the adapter.
- **Value check.** The commit compares previous and new visible values with
  `deepEquals` and pushes no event when equal (state.ts:1392-1402). That is the
  library's check, and what drops a note write on the projected window and label-cell
  queries.
- **Delivery timing.** Without an active transaction the scheduler runs a job at once
  (db/src/scheduler.ts:65-69), but 0.15 wraps every collection publication in
  `withPublicationContext` (scheduler.ts:183-216, collection/changes.ts:272-283), so the
  live-query graphs a commit wakes are queued and flushed, in dependency order, before
  `commit()` returns. A live query's `subscribeChanges` callback has therefore run when
  the write returns, and `settle` only renders the flagged views.
- **Read.** `toArray` is `Array.from(values())` (db/src/collection/index.ts:1114-1116,
  777-784), each row enriched with virtual props; the enriched copy is cached per KEY and
  reused while the stored row object is the same (state.ts:167-178, 325-363). `readAll`,
  `readOwners` and `readPairs` return the backing collection's `toArray` as it is
  (tanstack-db.ts:177, 736, 740); the audits compare fields, so the virtual props it adds
  are not read.
- **GC.** `gcTime: 0` disables the collection's GC timer
  (db/src/collection/lifecycle.ts:306-312); every live query is cleaned up explicitly.

## autoIndex 'off'

This row is the library default (db/src/types.ts:785-794, `@default "off"`). Every
ordered live query here logs the warning at db/src/query/compiler/order-by.ts:211-220
and falls back to loading the group. The warning offers two remedies, both registered:
an explicit `createIndex` on rank (`tanstack-db-indexed`) and `autoIndex: 'eager'`
(`tanstack-db-eager`). The adapter header (tanstack-db.ts:49-55) and the three
`departure` strings say exactly that.

## Scroll and switch

`setWindow` (collection-config-builder.ts:299-410) runs the window function inside a
publication context and then returns `loadOperation.wait()`, a promise whenever a subset
load was started (collection-config-builder.ts:392-410), which happens on this row with
no index. So `scrollTo` on this row (tanstack-db.ts:575-582) rebuilds the paged live
query at the new offset, the same shape `switchGroup` uses, and the indexed rows keep
`setWindow` (tanstack-db.ts:583-590). verify passes scrollWindow and deepScroll on all
three rows.

`switchGroup` cannot reuse `setWindow` anyway: the window function moves offset and
limit, and the `where` is compiled into the pipeline. A new live query over the new
group is the library's way.

## Churn read fold

Every churn mount stores its subscriber's read per slot (`churnRead[at]`) at mount and
in the body, and clears it on unmount (tanstack-db.ts:358, 389, 400, 417, 422, 463, 468,
500, 505), so the verify pass's fold over every standing subscriber
(harness/render.ts:124-141) checks each one's own source.

## Hoisting

Nothing is hoisted: the sync interface is addressed by key and hands back no handle.
`pin` copies the harness's ids for the `inArray` filter (tanstack-db.ts:280-292), which
is address, not value. `holdRelation` commits the pair records before the queries exist
(tanstack-db.ts:685-704), so no timed step mints. No chain or diamond level caches a
value: every read is out of the head or join collection the library maintains.

## Code volume

The figures are `npm run lines`' cell for each wiring: its builder, every helper it
reaches and every constant it reads, comments and blank lines excluded. Every wiring
pays for the collection-options-creator contract — a collection whose `sync` callback
hands out `begin`/`write`/`commit` (tanstack-db.ts:110-138) and the frame that keeps one
sync transaction open per collection (:78-107) — and the six row writes as sync
messages, insert and update told apart by `has` (:146-181), because the sync interface
is the only synchronous write path (see Write path).

- **churn.row** adds a `subscribeChanges` per subscriber with its `where` (:385-402) and
  the unmount (:353-360).
- **relations** adds two more collections on the same contract (:628-629), two
  `inArray` live queries and their change flags (:647-659), and the per-line reads
  (:662-669). The library has no relation primitive short of a join query, so each type
  is its own collection.
- **bind** adds one ordered, limited, projected live query per view (:229-247), the two
  per-column cell queries (:255-293) and the audit query for `groupOrder` (:206-215).

## Not determined

- That the diamond's join runs once per write under the publication context; derived
  from the scheduler and changes source above, not run.
- That `get(id)` on a live query is keyed by the source row's key — `head.get(id)` on a
  live query built `from` another live query, and the cell, owner and pair reads
  (tanstack-db.ts:270-273, 661-668); read from the compiler keeping the source key
  through `finalizeRow(key, …)` (db/src/query/compiler/index.ts:1274-1278), not run.
- That `includeInitialState: true` on the rebuilt, unindexed paged query delivers its
  rows synchronously in 0.15, given that the adapter declares the unindexed `setWindow`
  asynchronous.
- Time effects of every claim on this card.
