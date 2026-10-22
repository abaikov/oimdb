---
scenario: "cellDelivery"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "46f7c2d890327407"
verdict: "narrow"
models: "A detail pane, form or per-cell component bound to specific fields of specific rows that the code already holds a handle to, with one field written per frame."
measures: "Delivery granularity by column on pre-resolved rows: whether a write to `label` wakes only the label view and a write to `note` only the note view."
favours:
  - "Stores that route by column (per-property tracking, per-column identities): one view woken per write."
  - "Libraries that hand back a reusable handle for a key: the address is resolved untimed in `pin` (scenarios.ts:1627-1629) and every timed write goes through it; the script's comment says the pin exists to make oimdb's identity path measurable (scenarios.ts:1516-1522)."
  - "Against row-granular stores: both views woken, one with identical text; against no-granularity stores: everything re-read."
biases:
  - "The pin is a resolution outside the clock that only some libraries can use; libraries whose id is the handle pay a keyed lookup per write. The row therefore mixes column routing with handle availability; the comment states the pin is not isolated (scenarios.ts:1531-1533)."
  - "Eight rows, off screen, window views torn down (`PINNED_COUNT`, dataset.ts:79): a constructed situation with no window derivation at all, so the row isolates delivery and nothing else."
  - "One write per settle (scenarios.ts:1647-1661): coalescing does not enter, and `frame` is not used."
  - "The comment cites `packages/core/src/abstract/OIMCollection.ts:469` for the lookup cost (scenarios.ts:1518); that directory does not exist in the tree (`packages/core/src/abstract/` is absent, and no `OIMCollection.ts` is under packages/core/src). The 103-132 ns versus 36-51 ns figure is unverified."
summary: "An isolation of column-level delivery on pre-resolved rows; a real pattern for detail panes, but built around a handle some libraries do not have, so its times mix two properties."
---

## What the script does

`PINNED_COUNT × 2` = 16 steps. `prepare` pins 8 off-screen rows of group A
(`pinned`, the group-A rows ranked just past the window, dataset.ts:1033) and
`pin` re-points both consumers onto them: A renders `label`, B renders `note`
(scenarios.ts:1627-1629). The first half writes each pinned label, the second
each pinned note, one settle per write (scenarios.ts:1647-1661). `restore` puts
both columns back through the same pinned path (:1633-1643). Each consumer must
produce exactly 8 distinct renders (scenarios.ts:1669-1671); the answer is in the
delivery and redundancy counters. The oracle starts from the cell state `pin`
left (`emitCells` + `settled`, :1680-1695).

## Representativeness

Per-field subscriptions on known entities are real (a selected-item inspector, a
form bound to one record, a cell component). Eight such cells is a plausible
count. The row is narrow because the window machinery is switched off and the
address resolution is taken out of the clock, which only matters for libraries
that return handles.

## The standing record, checked

Its own record (scenarios.ts:1552-1619). B4 MET (:1593-1597): `stepDeliveryOf`
returns `cell` by key (floor.ts:84) and `BOUND_BY` scales it by `cellFloor`
(floor.ts:97), whose step is one 8-line cell delivery — consistent. B1 MET
(:1573-1577) claims no participant resolves a pinned position inside the clock
while another resolves in `prepare`; that is an adapter property and is not
verified in this card.