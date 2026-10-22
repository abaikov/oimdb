---
scenario: "appFill"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "a2d04163121c623a"
verdict: "narrow"
models: "A screen opening: 180 components mount over 80 cards, 10 decks and 5 users, and part of the data they show changes in the same frame."
measures: "Mounting 180 single-row subscriptions inside the clock, then one frame of 46 label writes that must wake exactly the 87 subscribers whose own row was written, delivered as one line."
favours:
  - "Stores whose per-subscription mount is cheap; 180 mounts against 46 writes make the mount the larger share of the step."
  - "Libraries whose batching API `frame` reaches (scenarios.ts:2916-2921) pay one notification instead of 46. The wake count does not change with batching: every subscriber reads one row (`mountOnRows(…, 1)`, scenarios.ts:2749-2753), and each written row is written once."
  - "Against stores with one store-wide listener: every standing subscriber's selector runs at the notification, written row or not (adapters/redux-toolkit.ts:449-462)."
biases:
  - "Nothing is inserted. The 95 scene rows are the first 95 rows of the dataset (`holdAppScene`, scenarios.ts:2726-2734), already in the store from the load (worker.ts:342-353, called at :362); the frame PATCHES labels. A screen fill usually creates rows as components mount, so key-creation cost is not in this row."
  - "The three entity kinds are names, not types: cards, decks and users are rows of one collection with one shape, distinguished only by index offsets (scenarios.ts:2692-2700). A deck's date subscriber reads a fixed user row chosen by the harness (`appUserOfDeck`, :2700), so no relation is resolved by the store."
  - "Each card has two subscribers on the same row (card and tag 0, scenarios.ts:2739-2742), so the fan-in is two per card, one per deck name and two per user."
  - "One frame, 46 writes, 180 subscribers: a small screen. Mount and write are not separated, so a row's time cannot be split between them from this table alone."
summary: "Mount wave plus one partial write frame over a small single-collection scene; the woke count and, on audited passes, the per-slot read fold say which row every subscriber sits on."
---

## What the script does

`prepare` resolves the 95 scene rows (scenarios.ts:2904-2906). The run
(:2913-2923) mounts the scene — per card a card subscriber and a tag-0 subscriber
on the card row, per deck a name subscriber on the deck row and a date subscriber
on that deck's user row (`APP_SCENE`, :2738-2747) — then, inside
`ctx.binding.frame`, writes a fill label to `APP_FILL_WRITTEN`: the 40 even cards,
decks 0-4 and user 0, 46 rows (:2759-2763). `restore` writes the resting labels
back through `writeAppLabels` (one `patchLabel` per scene row outside `frame`,
one settle, :2805-2808) and unmounts (:2907-2912); `repeatable: false` (:2903);
`auditChurnReads: true` (:2901).

`APP_FILL_WOKE` (:2765) counts the scene mounts whose row was written:
40 card + 40 tag-0 + 5 deck-name + 2 deck-date (decks 0 and 1 read user 0,
`appUserOfDeck`, :2700) = 87.

## What `check` and the oracle prove

`check` (scenarios.ts:2924-2938): one delivery, one distinct render, nothing on
view B, and the line exactly
`${appIds[0]} ${appRanks[0]} ${churnLineOf(87, appReadsOf(filled labels, 1))}`.
`churnLineOf` (render.ts:140-141) is `87:<card 0 label>` on a timed sample and
`87:<card 0 label>#180/<hash>` on the verify pass and the timed process's proof
pass, where `foldChurnReads` (render.ts:124-138) hashes every standing slot's
read by slot index (`setChurnReadsAudited`, worker.ts:489, 644). The oracle
(:2939-2945) writes the same 46 labels and emits the same line; compared in the
verify pass (worker.ts:488-534) and the proof pass (worker.ts:644-662).

The fold names, slot by slot, which label each of the 180 subscribers read. A
subscriber mounted on any other scene row reads that row's label under its own
slot index and changes the hash, so the swap among written (or among unwritten)
rows that a count alone could not see now fails on both audited passes.

## Ways a broken store passes

- **The woke count and the per-slot reads are the adapter's own bookkeeping**:
  `churnWoke` and `churnRead[at]` are set inside the subscriber bodies the
  adapter hands the library (e.g. adapters/redux-toolkit.ts:449-462), and
  `deliverChurn` (render.ts:143-153) folds what the adapter recorded. A body that
  wrote a read the library never delivered would be an adapter defect, outside
  this card.
- **Timed samples carry no fold.** Between the audited passes the line is
  `87:<card 0 label>`; the proof pass runs in the timed process after the
  samples, from the same restored state (worker.ts:644-662).

## Representativeness

Mounting a screen's worth of subscriptions in the same frame as data changes is
what a client does on navigation. Narrow because the data does not arrive (it is
patched), the entities are one collection, and the size is a small screen.

## The standing record, checked (APP_SCRIPT, scenarios.ts:2816-2881)

- A1 MET (:2817-2820) holds: the frame writes rows that mounted subscribers read.
- A2 MET (:2821-2825): `check` fixes deliveries and distinct at one, so the
  redundant count is zero on every passing row.
- A4 MET (:2831-2835): the woke count and the per-slot read fold are compared
  in the timed process's proof pass too (worker.ts:644-662).
- B4 MET (:2849-2855): `appFill` mounts inside the clock and is not in
  `STANDING_FRAME_SCENARIO_KEYS` (floor.ts:69-72), so `stepDeliveryOf` returns
  `mount` (floor.ts:81) and `UNBOUNDED_BECAUSE` declares it (floor.ts:108-119).
- C5 NOT MET (:2872-2880) computes its figures: 46 rows here, 91 per round of
  `appRound`. Agrees with `control-write` declining churn (harness/control.ts:1258).
- B5 (derived): `baseline-array-indexed` declines churn
  (adapters/baseline-array-indexed.ts:405).