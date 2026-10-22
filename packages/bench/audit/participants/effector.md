---
participant: "effector"
version: "23.4.4"
auditedAt: "2026-10-20"
auditedBy: "claude-opus-5-5 (verified)"
digest: "495bcf40d72aefcf"
verdict: "idiomatic"
summary: "Effector's own event-store-map-watch model. The window wiring holds one store per group, so a point write copies one group's Map and wakes that group's view alone; the read wiring keeps the population in one store, because a view switch has to re-point view A and a `combine` cannot change its inputs. The churn and relation wirings hold one store per row or owner. Effector 23 exports no batch function; in the window and cell wirings a frame is one event per touched group store carrying the array of the frame's operations, the Effector idiom for a bulk edit, and each pinned cell is its own `.map` down to one column's string."
wirings:
  bind:
    verdict: "idiomatic"
    note: "One store per group, minted on first ask with ONE event, `opsApplied`, carrying an ordered array of write/patch/drop operations reduced by one `.on` that copies the Map at most once per call (effector.ts:74-104, asked through `nodeFor` :161-168), and an id → group-node handle table (:159). One `.map` and `.watch` per view over its own group's store (:210-220). A reducer must return a new reference for Effector to see a change (`e!==r` in the store node, node_modules/effector/effector.mjs line 1); a write wakes only the view over the written row's group. Outside a frame every method fires `opsApplied` with one operation (`send`, :182-194); inside `frame` (`groupFrame`, :196-203) operations queue per store and each touched store's event fires once when `run` returns, so a frame costs one Map copy and one view recompute per touched group, not one per write. A move is a drop on one store and a write on the other, the row read with `getState()` first, after firing the old store's queue if this frame already queued that row (:283-297; effector.md, 'What a frame is to Effector'). Every view's `.map` returns a fresh array (:119-148), so a view's watcher fires whenever its own store updates."
  bindPerGroup:
    verdict: "idiomatic"
    note: "Same body with fifty bindings (effector.ts:1153): one `.map` per group store, so a write recomputes the one view over the written group, and a frame spread over every group fires one event per group."
  churn.row:
    verdict: "idiomatic"
    note: "One store per row with its own event (effector.ts:381-387). `count === 1` subscribes with `.updates.watch` on the row store and records the store's current label as the slot's read at mount (:501-510). `.updates` skips the initial call, as effector.md says ('What a mount is'). Each watcher writes `churnRead[at]` (:399-402) and `unmount` clears it (:545-552), so the verify-pass fold over every standing read (render.ts:124-141) sees only mounted subscribers. `frame` is `run()` (:39-41): the three scripts that open a frame here (`churnList`, `appFill`, `appRound`) write distinct rows, so each row store already gets one event per frame (effector.md, 'What a frame is to Effector')."
  churn.wide:
    verdict: "idiomatic"
    note: "`combine` over the source row stores (`joinedOf`, effector.ts:404-420), then `.updates.watch` (:512-514)."
  churn.column:
    verdict: "idiomatic"
    note: "`row store.map(row => row.label)` (effector.ts:516-523). The store's own `===` skip on the derived string is what makes it a column (effector.mjs, `e!==r`). The adapter does not compare anything."
  churn.chain:
    verdict: "idiomatic"
    note: "Level 1 is the `combine` over the `count` source stores returning `chainLevelOf(label of row from, 1)` (`chainJoinedOf`, effector.ts:422-431); levels 2..depth are each a `.map` returning `chainLevelOf(text, level)`; `.updates.watch` on the head (:524-533). `unmount` calls `clearNode` on every derived node (:545-552), Effector's public teardown."
  churn.diamond:
    verdict: "idiomatic"
    note: "Two `.map`s of root row `from`'s store (`diamondLeftOf`, `diamondRightOf` of its label) and `combine(left, right, diamondJoinOf)`, with `.updates.watch` on the join (effector.ts:534-544). All three are cleared on unmount (:545-552). That the join runs once per write is left to Effector's kernel; not traced (effector.md, 'The derivation shapes'), and the diamond script's check is what asserts it."
  reads.byKey:
    verdict: "idiomatic"
    note: "One `getState()` per page and one `Map.get` per key, nothing hoisted (effector.ts:754-763)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "View A's cursor (group and offset) is its own store (effector.ts:678-680). View A is `combine($state, $cursor)` (:719-727) and view B is `$state.map` (:728-730), so a scroll reruns A only (:767). The population is one store here, for the reason in `reads.bySwitch`."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is a `.map` of `$state` with the second predicate over group A (effector.ts:728-730, predicate at :698). One-store granularity: every write in this wiring recomputes both views and copies the population Map; the only timed writes are this script's four moves."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` fires `switched` (effector.ts:768), on which the cursor store's reducer returns `{ group, offset: 0 }` (:680): one event, one cursor update, one recompute of view A over the new group's ids in `$state`. View B does not read the cursor. The population stays one store in this wiring because a `combine` fixes its inputs at creation and `TViewConfig` names only two groups at bind; a partition was considered and not made (effector.md, 'Which store the population lives in'), because it would add an id → group lookup to every key `readByKey` measures while four of the five read scripts write nothing."
  relations:
    verdict: "idiomatic"
    note: "Rows and pairs are each one store (effector.ts:817-861, :866-886), and every owner has its own store and event (:920-930). View A is `combine` over the touched owner stores (:948-956), so a pair write cannot reach it. `writePair` composes the key on every call (:987-992). No relation script opens a frame."
  single:
    verdict: "idiomatic"
    note: "`createStore('')` with `.on(event, (_, next) => next)` and `.updates.watch` (effector.ts:1030-1096). Re-sending an equal value is skipped by the store's own `===`."
improvements:
  - "APPLIED — the window wiring's population is partitioned into one store per group (effector.ts:74-104, :153-363), the layout nanostores' window wiring already uses; a store layout is the adapter's to choose. Unmeasured."
  - "APPLIED 2026-10-20 — a frame in the window and cell wirings is one `opsApplied` event per touched group store with the array of the frame's operations (effector.ts:170-203), replacing one event and one Map copy per write. Expected to move batchPatch, batchPatchNote, patchMostRows, mixedFrame, moveAndReorder and resortWindow; unmeasured."
  - "APPLIED 2026-10-20 — the cell wiring is a `.map` per pinned cell and column over the row's group store and a `combine` per column over its cells (`pinnedTextOf`, effector.ts:234-250), so a label write reaches only the label consumer by Effector's own `===` skip on the cell string. It replaced a `combine` over the whole group stores that rebuilt both columns' arrays on every pinned write. Expected to move cellDelivery; unmeasured."
  - "DECLINED — derive each view into a store created with Effector's documented `updateFilter` option (node_modules/effector/index.d.ts:398) through `sample`, filtering on element-wise identity of the window rows. `updateFilter` is the library's option, but the element-wise comparator handed to it would be written in the adapter, and `TBinding.write` forbids an adapter supplying an equality its library does not ship. Not applied, by ruling."
  - "DECLINED — partitioning the read wiring's population (see `reads.bySwitch`)."
---

## Version and recipe

`node_modules/effector/package.json` is `23.4.4`, the same as `version`
(effector.ts:1100). The model is Effector's own: events, stores updated by `.on`
reducers, derived stores by `.map` and `combine`, subscriptions by `.watch` or
`.updates.watch`, teardown by `clearNode`.

## Batching

Effector 23's public exports (the export list at the end of
node_modules/effector/effector.mjs) contain no `batch(fn)`. The `batch` flags in
index.d.ts (:525, :541, and `sample`'s config at :1768-1778) belong to `sample` and to
the low-level `step` API and coalesce updates inside one launch, not across separate
event calls. Effector's idiom for a bulk edit is one event whose payload is the array of
changes. In the window and cell wirings `frame(run)` (`groupFrame`, effector.ts:196-203)
queues each operation on the group store it targets and, when `run` returns, fires that
store's one `opsApplied` event with the queue: one launch, one Map copy and one view
recompute per touched group per frame. No value is compared. In the churn, read, relation
and single wirings `frame` is `run()` (:39-41), and no frame there writes one store twice:
churn's three framing scripts write distinct row stores, and no read, relation or single
script opens a frame (effector.md, 'What a frame is to Effector').

## The store layout, per wiring

- `bind` builds its views before any row exists, and `.map`/`combine` fix their inputs
  when created, but the watched groups are known at bind. So the window wiring holds one
  store per group, minted on first ask (effector.ts:161-168), each with one `opsApplied`
  event (:74-104). A point write copies one group's Map, and only that group's view
  recomputes.
- A move is a drop on one store and a write on the other (effector.ts:283-297). The
  write carries the row, read out of the old store with `getState()` in the binding
  method — the same out-of-graph read the churn wiring's patches make (:445-464) —
  because a reducer sees only its own store's state.
- The cell wiring is a `.map` per pinned cell and column over that row's group store,
  returning one string, and a `combine` per column over its cells (`pinnedTextOf`,
  :234-250; `pin`, :301-324). `.map` skips a `===` result, so a label write updates one
  label cell, the note `combine` does not recompute, and the note consumer is not
  delivered.
- The read wiring keeps the one-store shape (`$state`, effector.ts:587-676): view A must
  follow a switch to any group, and a `combine` cannot change its inputs. There every
  point write copies the population Map and recomputes both views; the only timed writes
  are `filterTwoAxes`' four moves.
- Effector skips an update whose new state is `===` the old one (the store graphite
  node compares `e!==r`, node_modules/effector/effector.mjs line 1, minified). A pure
  reducer therefore has to allocate a new Map for every point write. That is the
  documented immutable-update contract applied to a Map, not extra work invented by the
  adapter.

## Where the granularity is finer

The churn wiring subscribes only after `holdChurnRows`, so it holds one store per
row (effector.ts:381-387), and a point write copies only that row (:445-464). The
relation wiring gives each owner its own store (:920-930). Both shapes are Effector's
own. Every churn mount records its subscriber's current read at mount time
(:509, :514, :522, :532, :543) and every wake overwrites it (:399-402), which is what
the verify-pass churn read fold checks.

## Teardown

`pin` and `dispose` call `clearNode` on every derived store, the cell `.map`s and
`combine`s included (effector.ts:301-306, :345-362). The group stores are roots and are
left to the collector, as the relation wiring leaves its owner stores (:1012-1015). That
is why this row does not carry the stale-derivation exposure nanostores carries.

## Unverified

Nothing here was run. The partition's, the frame event's and the per-cell `.map`'s
effects on any row are unmeasured. The diamond's single run per write is not traced in
the kernel. The cell `combine`'s callback relies on the tuple quirk the churn and
relation wirings already rely on (effector.ts:404-420, :948-956), and `.slice()`s the
array it is handed so the result is a fresh array whatever the kernel passes.
