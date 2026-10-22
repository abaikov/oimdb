---
scenario: "appSettingMove"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "e2ec90692f738756"
verdict: "representative"
models: "A user changes one preference on a mounted screen (date format, locale, a toggle), and only the few components that read it should update."
measures: "The cost of finding and running the 2 subscribers of one written row among 180 standing ones, per write."
favours:
  - "Stores with a per-row or per-value subscriber list: the cost of a step does not depend on how many other subscribers stand."
  - "Against stores with one store-wide listener: every subscriber's selector runs on every write (adapters/redux-toolkit.ts:449-462), 180 per step here. Each step is one dispatch outside `frame`, so autoBatch flushes at once (adapters/redux-toolkit.ts:88-90, 103-108)."
biases:
  - "On a timed sample the delivered line is the same on every step: woke = 2 and subscriber 0's read, which is card 0 and is never written (scenarios.ts:3038-3046; render.ts:140-141). The moved dates enter the line only on the verify and proof passes, through the per-slot read fold."
  - "The counters the report prints come from the audited passes (verify emit, worker.ts:545-549; proof-pass emit, worker.ts:671-676), where the fold makes every step's line distinct: `check` then expects 20 deliveries and 20 distinct (scenarios.ts:3047-3055), so redundant is 0 on every passing row. The counters are identical across passing rows; only the time differs."
  - "180 standing subscribers is a small screen; the gap between selective and store-wide designs grows with that count, and this point is where it is smallest."
  - "One write per frame, so `frame` is not used and has nothing to change."
summary: "A common, selective write on a mounted screen; it prices finding a few subscribers among many, its counters are fixed by the check, and the audited fold proves which two bodies ran and what they read."
---

## What the script does

`APP_SETTING_STEPS` = 20 steps (dataset.ts:178) over the scene mounted and primed
in `prepare` (`prepareStandingAppScene`, scenarios.ts:3034, 2811-2814). Each step
writes one user row — user `step % 5`, so each user four times — and settles
(:3038-3046). Only that user's two deck-date subscribers read it
(`APP_DATES_PER_USER`, :2697). `auditChurnReads: true` (:3031).

## What `check` and the oracle prove

`appSettingLinesOf` (scenarios.ts:2795-2803) computes each step's line as
`churnLineOf(2, appReadsOf(labels, 1))`. `check` (:3047-3055) demands 20
deliveries, a distinct count equal to the number of changes between consecutive
computed lines, and nothing on view B. The oracle (:3056-3064) emits those same
lines.

On the verify and proof passes the fold (render.ts:124-138) carries the two date
subscribers' new reads, so every line differs and `check` expects 20 distinct.
That proves, slot by slot, that the two subscribers of the written user — and no
others — read the new value. A store that woke two date subscribers of a different
user, or read a stale value, changes the hash and fails.

## Ways a broken store passes

- **The woke count and the per-slot reads are the adapter's own bookkeeping**
  (`churnWoke`, `churnRead[at]`, e.g. adapters/redux-toolkit.ts:449-462).
- **Timed samples carry no fold**; the proof is the pass after the samples in
  the same process (worker.ts:644-662).

## Representativeness

Changing one setting that a handful of components read, while many others are
mounted, is among the most frequent writes in a client application, and it is
where subscription granularity matters most. The realistic shape, at a small
screen size.

## The standing record, checked (APP_SCRIPT, scenarios.ts:2816-2881)

- A2 MET (:2821-2825) says that on a timed sample this row is distinct once by
  construction, "so the redundant count is that row's whole answer". The
  redundant count the report prints is taken on the audited passes
  (worker.ts:545-549, 671-676), where the same text says every step is distinct,
  so the printed count is 0 on every passing row and carries no answer. The
  falsifier's premise (the timed line) and the counter it points at (the
  audited one) are taken on different passes.
- B4 MET (:2849-2855): this script is in `STANDING_FRAME_SCENARIO_KEYS`
  (floor.ts:69-72), so `stepDeliveryOf` returns `frame` (floor.ts:80) and the
  `frame` reason in `UNBOUNDED_BECAUSE` (floor.ts:120-128) is printed: a step
  mounts nothing and is one write, the bodies that read it, and one line. That
  describes this script.