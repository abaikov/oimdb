---
participant: "nanostores-per-row"
version: "1.5.5"
auditedAt: "2026-10-21"
auditedBy: "claude-opus-5-5 (window, cell and read wirings read against nanostores.ts:827-1185; churn, relations and single are nanostores' own and taken from audit/participants/nanostores.md; churnOne and batchInsert verified)"
digest: "5fdce3493f7aa373"
verdict: "idiomatic"
summary: "The same nanostores 1.5.5 as the `nanostores` row with a different store layout for the window, cell and read wirings: one `map` store per row written with `setKey`, so a point write copies that row's record alone, and a per-group version atom that every row store's own listener bumps, with each view a `computed` over that atom reading its group's row stores. The load, a removal and a move run inside `batch`, so a call notifies each view once. Any write to a row, a note write included, bumps its group's atom and recomputes that group's view. The churn, relation and single wirings are the `nanostores` adapter's, unchanged."
wirings:
  bind:
    verdict: "idiomatic"
    note: "`nanostoresPerRowAdapter` spreads `nanostoresAdapter` and replaces `bind`, `bindPerGroup` and `reads` (nanostores.ts:1254-1281). bindViewsPerRow (:855) keeps an id -> { row store, group } table and per-group membership maps holding store handles (`groupFor`, :862-869). `admit` (:875-895) creates `map({ ...row })` per new row with a `listen` that bumps the row's group atom (`bump`, :871-873), moves the handle between membership maps on a group change, and writes an existing row with one `set`. Each view is `computed(group.$version, …)` over its own group, selecting the window with `windowOfMembers` over the member stores (:896-905, :827), then `.subscribe` delivers. Point writes are `setKey` on the row's own store (`patchLabel`/`patchNote`, :940-941; `setRank`), so a write copies one row record (node_modules/nanostores/map/index.js:14-19) and not the group's; `setGroup` (:942-955) moves the handle and bumps the group it left before the `setKey`. `write` and `remove` run inside `batch` (:924-939), and `frame` is `batch(run)` (:38-40), so a multi-write call reaches each view's listener once with final values (atom/index.js:15-57). The cell wiring built by `pin` (:969-995) is a `computed` per pinned row store and column and a `computed` over those per column (`pinnedTextOf`, :913-922), so a label write leaves every note cell's string `Object.is`-equal and the note consumer is not delivered."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty views (nanostores.ts:1279), each a computed over its own group's version atom, so a write recomputes the one group's view its row is filed in."
  churn.row:
    verdict: "idiomatic"
    note: "Inherited unchanged from `nanostores` (`churn` is not overridden, nanostores.ts:1254-1281; churnShapes at :1230 over bindChurnStore, :272). One `map` store per row and `listen` on it; see audit/participants/nanostores.md, churn.row."
  churn.wide:
    verdict: "idiomatic"
    note: "Inherited unchanged from `nanostores` (nanostores.ts:1230). A `computed` over the source row stores and `listen`, with the same deferred-unmount exposure (`STORE_UNMOUNT_DELAY`) the `nanostores` card states."
  churn.column:
    verdict: "idiomatic"
    note: "Inherited unchanged from `nanostores` (nanostores.ts:1230). `listenKeys(store, ['label'])`, the library's own key filter."
  churn.chain:
    verdict: "idiomatic"
    note: "Inherited unchanged from `nanostores` (nanostores.ts:1230). Each level is nanostores' own `computed` over the level below, `listen` on the head."
  churn.diamond:
    verdict: "idiomatic"
    note: "Inherited unchanged from `nanostores` (nanostores.ts:1230). Two `computed`s over the root store, a third over both, `listen` on the join; nanostores' epoch check runs the join once per write (see the `nanostores` card)."
  reads.byKey:
    verdict: "idiomatic"
    note: "`readKeys` (nanostores.ts:1144-1154) looks each key up in the id -> row store table and reads it with `get()`, nothing resolved in advance."
  reads.byWindow:
    verdict: "idiomatic"
    note: "bindReadStorePerRow (nanostores.ts:1011) holds one `map` store per row (`storeById`, :1016), a Set of ids per group (`byGroup`, :1017), a population version atom (:1018) that every row store's `listen` bumps (:1095-1103), and a cursor atom (:1020). View A is `computed([$population, $cursor])` selecting the top `offset + window` of the cursor's group with `selectOf` (:1036-1067, :1068-1076); a scroll is one cursor `set` (:1155-1157), which recomputes view A only. Any row write bumps the population atom and recomputes both views, a note write included."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "View B is `computed($population)` selecting group A with the second-axis predicate (`onSecondAxis`, nanostores.ts:1047; :1077-1079)."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "`switchGroup` sets the cursor atom to `{ group, offset: 0 }` (nanostores.ts:1158-1160): one atom write and one recompute of view A over the new group's ids. View B does not name the cursor."
  relations:
    verdict: "idiomatic"
    note: "Inherited unchanged from `nanostores` (`relations` is not overridden; bindRelationStore, nanostores.ts:597). One `map` store per row, owner and pair; see the `nanostores` card."
  single:
    verdict: "idiomatic"
    note: "Inherited unchanged from `nanostores` (bindSingleStore, nanostores.ts:757). `atom('')` and `listen`; `atom.set` skips an `Object.is`-equal value."
improvements: []
---

## Version and recipe

The same package as the `nanostores` row: `node_modules/nanostores/package.json` is `1.5.5`,
and `nanostoresPerRowAdapter` takes `version` from `nanostoresAdapter` (nanostores.ts:1190,
spread at :1255). Its `departure` (:1257-1261) prefixes the per-row layout to the `nanostores`
departure, and its `admission` (:1262-1265) names the per-row stores and the per-group
version atom. The recipe is nanostores' own: `map` per record, `computed` for derived state,
`subscribe`/`listen` for consumers, `setKey` for one key, `batch` for a frame.

## What differs from the `nanostores` row

The `nanostores` window wiring holds one `map` store per group and every `setKey` spreads that
group's record; this row holds one `map` store per row, so a point write copies one record and
the group is reached through its version atom. The price of the layout is that the row store's
listener cannot tell which column moved, so a note write recomputes its group's view as a label
write does; the window views deliver text they already show, which the harness counts as
redundant delivery. Which layout is faster for which script is what the two rows measure.
