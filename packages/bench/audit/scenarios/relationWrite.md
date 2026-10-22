---
scenario: "relationWrite"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "0ebfb6f9ccd21a5e"
verdict: "narrow"
models: "A related record changes and every row showing it updates: a user renames themselves and the 2 messages they authored re-render their author name; repeated for 4 users, 8 times."
measures: "A write to one entity of a second type reaching a view that renders it against rows of the first type, with the row-to-owner mapping resolved before the clock; plus whether a second view over the same rows (via pair records) is woken."
favours:
  - "Stores with per-entity subscriptions on the second type: a subscription on the 4 owner entities wakes view A and never view B (oimdb holds owner slots and row slots at bind, `adapters/oimdb.ts:867` `bindRelationViews`, `holdRelation` from `:957`, one effect per touched owner slot at `:977-981`)."
  - "Designs with no relational machinery at all: the foreign key is resolved once by the ADAPTER in `holdRelation` (anchor `adapters/baseline-array.ts:813-834`, `rowOwners`; oimdb `rowOwnerSlots`, `adapters/oimdb.ts:964-966`; tanstack-db builds its own `ownerLines` map, `adapters/tanstack-db.ts:1128-1130`, and its owner live query is a `where ... inArray` over the owner collection, not a join, `:1010-1017`), so a store's native join (a live-query join, a relationships module) is neither needed nor credited."
biases:
  - "The relationship is immutable (`ownerOf` derives it from the id, `dataset.ts:357-372`; A1 NOT MET at `scenarios.ts:4783-4793`): no step re-parents a row (moving a task to another project), which is where a store's join maintenance is paid. Toward stores without join indexes."
  - "Size is 8 rows, 4 owners, fan-out 2, 8 steps (`dataset.ts:265-287`). A real list of messages with authors is tens to hundreds of rows on screen and thousands in the store; at 8 the delivery and settle constants dominate. Toward stores with low per-frame cost."
  - "Because the join is resolved positionally before the clock, the timed step is one field write on a held owner plus one notification plus an 8-line delivery; it differs from a single-entity column patch mainly in which collection holds the entity."
  - "The lean anchor wakes both views every settle (`adapters/baseline-array.ts:701-708`, one `dirty` flag; `settle` at `:860-865` renders both), so its B deliveries are all redundant by construction; that is the comparison the row is built for, and it counts against the anchor."
summary: "Eight owner renames reaching an 8-row joined view, with the foreign key resolved by each adapter before the clock; real in shape, tiny in size, and blind to re-parenting and to any store's own join."
---

## The script

`scenarios.ts:4866-4948`: `prepare` calls `holdRelation` once, untimed (`:4901-4903`); each of
`RELATION_STEPS` = 8 steps calls `patchOwnerName(step % 4, name)` and `settle` (`:4914-4920`),
names from `RELATION_NAMES` (`:4761-4764`). `check` (`:4924-4927`) demands 8 distinct states on
view A with 8 rows each and none on view B. The oracle loads owners and pairs into its own maps
and re-derives both views (`:4934-4947`, `oracle.ts:184`). Relation rows are rows `k` and
`100 + k` for `k` < 4, which share an owner by arithmetic (`dataset.ts:992-1017`).

## What decides the row

The cost of a write to a held entity plus routing it to exactly the view that reads it. The
relational step — finding which rows point at the owner — is done by the adapter at bind time
in every binding read for this card (anchor, oimdb, tanstack-db); whether every adapter does the
same is unverified, but `types.ts:198-200` permits it ("the segments are resolved here").

## Representativeness

The event shape (update a parent, children re-render) is among the most common in normalised
front-end state, and few public benchmarks have it: js-framework-benchmark is single-type;
js-reactivity-benchmark has no entity model. So the row covers ground those suites lack. It is
narrow because (a) 8 rows is a toy size, (b) the relationship never moves, and (c) the join is
outside the clock, so a store that answers relations natively and one that does not are timed
on the same notification path.

## Standing (RELATION_SCRIPT, `scenarios.ts:4775-4864`)

- A1 NOT MET is accurate; its text says "the fifteen with no row in these tables at all"
  (`:4791-4792`), but of the eighteen `ADAPTERS` (`harness/registry.ts:32-51`) only
  `baseline-array-indexed` declines `relations` (`adapters/baseline-array-indexed.ts:418-426`);
  seventeen supply a build, and so do all three controls (`harness/control.ts:1186, 1222, 1274`).
  Stale count.
- B1 MET (`:4811-4815`) says the anchor does not work out at bind time that view A depends on
  owners "where the engine is asked to"; in practice every binding read resolves row → owner at
  bind time, the anchor included (`rowOwners`, `adapters/baseline-array.ts:821-823`). The
  asymmetry B1 guards against does not exist, in the other direction from the one it describes.
- B2 MET (`:4816-4819`) says the anchor "rescans"; it renders from pre-resolved arrays
  (`adapters/baseline-array.ts:737-750`) and does not rescan anything.
- C3 MET (`:4846-4849`) says "with two participants"; the tables now hold seventeen
  participants plus the controls.
- The family comment saying `oimdb-3.12.1` is "NOT WIRED for these two scripts"
  (`:4731-4736`) is contradicted by `adapters/oimdb-legacy.ts:1065-1070`, which supplies a
  relation build (adapter name at `:1042`).
