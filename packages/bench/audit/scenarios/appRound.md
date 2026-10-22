---
scenario: "appRound"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "a758c0b1221d92ac"
verdict: "narrow"
models: "A mounted screen in heavy use: lists of tags growing and shrinking under every card, every deck renamed, every card toggled and one user's setting changed, all in each frame."
measures: "One frame per round of subscriber mounts or unmounts followed by 91 writes over three entity roles, with the exact number of woken subscribers named in the delivered line."
favours:
  - "Stores with cheap mount and unmount: each round mounts 80 tag subscribers, or unmounts 240 on every fourth round (tag count cycles 2, 3, 4, 1 via `appTagsAfter`, scenarios.ts:2701, 2972-2978)."
  - "Stores whose wake cost is per subscriber of the written row rather than per standing subscriber. A store with one store-wide listener runs every subscriber's selector at each notification (adapters/redux-toolkit.ts:449-462). Inside `frame` the Redux Toolkit adapter defers notification to the frame end with autoBatch (adapters/redux-toolkit.ts:72-101), so that is one walk over the 180 to 420 standing subscribers per round, not one per dispatch."
  - "Libraries whose batching API `frame` reaches (scenarios.ts:2982-2993) notify once per round instead of 91 times."
biases:
  - "Intensity: every card and every deck is rewritten in every one of 20 frames and every card's tag list changes every frame. A real screen does each of these sometimes; all of them every frame is a stress composite."
  - "Single collection, harness-resolved relations, two subscribers per card row at rest: the same scene as `appFill` (see that card)."
  - "SELECTIVITY IS ENFORCED, NOT MEASURED. The oracle's line names `appRoundWoke(round)` (scenarios.ts:2702-2703, 3013), so a library that wakes bodies outside the written rows fails rather than ranking slow. Every passing row reports the same counts; time is the only discriminator."
  - "Mounts and unmounts happen before `frame` is opened (scenarios.ts:2973-2978 against :2982), so a library that would batch subscription changes with writes cannot."
summary: "A dense composite frame — mounts, unmounts and writes over the whole scene, every frame — with an exact wake count and, on audited passes, a per-slot read fold that catch leaked, missing or misplaced subscriptions; real in kind, heavier than any screen sustains."
---

## What the script does

`APP_ROUNDS` = 20 rounds (dataset.ts:177) over the scene mounted and primed in
`prepare` (`prepareStandingAppScene`, scenarios.ts:2964, 2811-2814). Each round
adjusts every card's tag subscribers to `appTagsAfter(round)`, then inside
`ctx.binding.frame` writes a new name to each of 10 decks, a toggled mark to each
of 80 cards and a new setting to user `round % 5`, and settles (:2968-2996). Deck
names are unique per round and card marks alternate between two sets
(:2710-2717), so every write is a change. The run ends with one tag per card
standing (`appTagsAfter(19)` = 1), where it started. `auditChurnReads: true`
(:2961).

## What `check` and the oracle prove

`check` (scenarios.ts:2997-3000): 20 deliveries, 20 distinct renders, nothing on
view B. It does not compare the line itself; the oracle's line per round
(:3001-3015, `emitAppLine` at :2776-2785) names `80·(1 + tags) + 10 + 2` woken
bodies, card 0's mark and, on audited passes, the fold of every standing slot's
read (`appReadsOf`, :2767-2774, which includes the tag slots standing that round;
`churnLineOf`, render.ts:140-141). The digest is compared in the verify pass
(worker.ts:488-534) and in the timed process's proof pass (worker.ts:644-662).

## Ways a broken store passes

- **The woke count and the per-slot reads are the adapter's own bookkeeping**
  (`churnWoke`, `churnRead[at]`, e.g. adapters/redux-toolkit.ts:449-462). The
  fold closes what the previous card listed as passes — a card, tag or deck-name
  subscriber mounted on another row of the same role, and deck-name or date
  subscribers reading a stale value — because each slot's read is hashed under
  its own index.
- **Timed samples carry no fold** (render.ts:115-116); only the two audited
  passes do.
- The stored values are also covered by the population audit (worker.ts:462).

## Representativeness

Mounts, unmounts and writes to several entity roles in one frame is what an
interactive screen produces, and it is the only script here where a frame mixes
subscription changes with data changes at scale. The frequency is not realistic:
read the row as a ceiling on a busy frame.

## The standing record, checked (APP_SCRIPT, scenarios.ts:2816-2881)

- A2's redundant count is fixed at zero by `check`.
- B2's falsifier names the four-to-one tag shrink (:2841-2844), where the anchor's
  `indexOf` plus `splice` unmount is exercised (adapters/baseline-array.ts:638-650).
- B4 MET (:2849-2855): this script mounts inside the clock, so `stepDeliveryOf`
  returns `mount` (floor.ts:81; it is not in `STANDING_FRAME_SCENARIO_KEYS`,
  floor.ts:69-72), and the `mount` reason in `UNBOUNDED_BECAUSE` applies
  (floor.ts:108-119).
- C5 NOT MET (:2872-2880) states 91 writes per round, which matches
  `APP_DECKS + APP_CARDS + 1`.