---
scenario: "compositeKeyWrite"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "bcff3915bcabfd55"
verdict: "narrow"
models: "A record that exists per pair of entities (a reaction per (user, message), a read receipt, a membership role per (team, member)) being updated, one pair per frame, while a joined view over the same rows must stay quiet."
measures: "Composing a two-part key from two identities per call, resolving it to an existing record, writing one field, settling, and delivering an 8-line view; plus whether the joined view is woken."
favours:
  - "Stores whose composite lookup is cheap relative to a settle: a joined string into a Map (anchor, `pairKey`, adapters/baseline-array.ts:735, used at :852), a trie over scalar tuples (adapters/oimdb-legacy.ts:747, 766-775, `OIMCollectionStoreTrieDriven`), or a tree over entity slots (adapters/oimdb.ts:882-888, `OIMSlotStoreServiceTreeDriven` in `bindRelationViews`)."
  - "Stores that route the pair write to the pair view only; the anchor's single `dirty` flag wakes the joined view redundantly every step."
biases:
  - "One key composition per step against one settle and one 8-line delivery per step (scenarios.ts:5004-5007); the composite-key cost the row is named for is likely a small share of each step. That share is unverified by measurement here; `relationFloor` gives the delivery share."
  - "Every record exists before the clock (`holdRelation` in `prepare`, scenarios.ts:4988-4990), so the mint of a new pair (the first reaction on a message) is not measured. Toward stores whose insert path is expensive."
  - "The two key segments are always an existing owner and an existing row; a composite key over scalars that are not entities is out of scope for `@oimdb/core` (scenarios.ts:4725-4729) but measured for `oimdb-3.12.1`, so the table compares two different key shapes under one label, as SCENARIOS.md:158 says."
  - "8 records, 8 steps (`RELATION_ROWS`, dataset.ts:272; `steps`, scenarios.ts:4983): a toy size for a pair table, whose real size is the product of two populations."
summary: "Eight updates to records keyed by (owner, row), each composed per call; real in kind, but at this size the settle and delivery dominate and minting a pair is not timed."
---

## The script

scenarios.ts:4969-5031: `prepare` calls `holdRelation`, which creates the 8 pair records
(:4988-4990); `restore` writes each back to its seed through the same composed-key path and
resets `pairTurn` (:4993-4999); each run writes all 8 marks in order with a settle after each
(:5000-5008), alternating two disjoint mark sets via `pairTurn` (:5002-5003) so every write is a
change. `check` (:5011-5014) demands 8 distinct states and 8 rows on view B and no distinct
state on view A. The audit reads the key back out of the store (`readPairs`, types.ts:207;
`firstPairMismatch` in `auditStore`, worker.ts:476-481), so a mark in the wrong pair fails even
when it renders right: a real strength of this row.

## Representativeness

Per-pair records are common in applications and are usually modelled as a map keyed by a
joined string. The script is faithful to the update of an existing pair and is the only row in
the suite that times a composed key. It is narrow: 8 records, update only, and a step whose time
is mostly frame and delivery. No public reactivity benchmark has a composite-key case at all.

## Standing (RELATION_SCRIPT, scenarios.ts:4780-4864)

- A1 NOT MET (:4783-4793) concerns the relation being immutable; it applies here only in that
  pair records never change their segments. Its count ("the fifteen with no row in these tables
  at all", :4792) is stale: 15 adapters supply `relations.build` (every adapter file except
  `baseline-array-indexed.ts:418`, which declines; see `relationWrite.md`).
- B3 NOT MET (:4820-4826): one declaration covers both relation scripts. Holds.
- C3 MET text "With two participants" (:4846-4849) is stale for the same reason.
- The description says "this engine ships none" for scalar composite keys (:4979-4981); true
  of `@oimdb/core`, while `oimdb-3.12.1` in the same table keys by scalars
  (adapters/oimdb-legacy.ts:747, 766-775) with `relations.absent: ''` (:1067-1070), contradicting
  the comment at :4731-4736 that it is NOT WIRED and that its `relations.absent` says so.