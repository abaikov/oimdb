---
scenario: "deepScroll"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "7656e0329b82f1da"
verdict: "narrow"
models: "Jumping a virtualised list far from its head and back, as a scrollbar drag does, over data that does not change."
measures: "How the cost of producing one window grows with its offset into an ordered group, from 42 to 168 rows deep and back, with nothing written."
favours:
  - "Stores that keep each group's order as a sequence they can slice at an offset: the deep window costs what the shallow one does."
  - "Against top-k re-selection whose k is offset plus window: both anchors select the top `offset + WINDOW` rows and render the tail (adapters/baseline-array.ts:286-294; adapters/baseline-array-indexed.ts:254-261), as does the mobx view (adapters/mobx.ts:478-488). At the deepest offset k equals the whole 200-row group, so the selection becomes a full insertion sort of the group."
  - "Stores that subscribe per visible row pay one re-point per visible row per step whatever the offset (adapters/oimdb.ts:835-840 sets `shapeMoved`, consumed at :411-413), so depth is not what separates them."
biases:
  - "DEEP IS SHALLOW. At the default point a group holds 200 rows (DEFAULT_N 10 000, registry.ts:170; GROUPS 50, dataset.ts:37), so the deepest offset is 168 (`deepStride` = floor((200 − 32) / 4) = 42, dataset.ts:884-887). A virtual list in an application can be thousands of rows deep; the gap between an indexed slice and a growing top-k is smallest here."
  - "Each step jumps 42 rows, not a smooth scroll of a few rows; a store that reuses most of the previous window gets nothing for it."
  - "The description says the deepest offset is the group's size less one window (scenarios.ts:4420-4421). That holds only when `groupSize − WINDOW` is divisible by 4, which it is at the default point (168)."
  - "View B, the fixed two-axis window over group A, must not change; the lean anchor re-renders it on every settle (adapters/baseline-array.ts:295-300), counted as redundant and permitted."
  - "`tanstack-db` (autoIndex off) declines `reads.byWindow` (adapters/tanstack-db.ts:1368-1374, 1388): in @tanstack/db 0.15 `setWindow` without an index settles asynchronously. The library is in this table only through `tanstack-db-eager` and `tanstack-db-indexed`, so its unindexed configuration is not priced here."
summary: "The scroll script at deep offsets, which separates a maintained order from a re-selection that grows with the offset; at the default size the deepest window is only 168 rows in."
---

## What the script does

`SCROLL_STEPS` = 8 (dataset.ts:203). Offsets are `deepStride · (step + 1)` out
and `deepStride · (7 − step)` back (dataset.ts:884-887): 42, 84, 126, 168, 126,
84, 42, 0 at the default point. Each step calls `scrollTo(offset)` and settles
(scenarios.ts:4437-4444). `restore` scrolls to 0 (:4433-4436). Consecutive
offsets differ, including the last of one run (0) against the first of the next
(42).

## What `check` and the oracle prove

`check` (scenarios.ts:4445-4452): view A distinct renders = 8, final view A row
count = `WINDOW`, view B distinct 0. The oracle emits `windowAt(groupA, offset)`
(filter, sort, slice; oracle.ts:287-298) and the axis window per step
(`emitReadViews`, scenarios.ts:4453-4456, oracle.ts:360-363). The digest folds row
counts (consumer.ts:124-127), so a short page at a deep offset fails; it is
compared in both passes (worker.ts:488-531, 644-660).

## Ways a broken store passes

- **The final row count is taken at offset 0.** That every intermediate page is
  full is proved by the digest, not by `check`.
- **Deliveries are not counted**, only distinct renders: a store that delivers
  twice per scroll passes, and its redundant count is printed.
- **A window kept from an earlier sample** at the same offset renders identical
  text; the offsets repeat every run. READ_SCRIPT A1 forbids an adapter doing
  this (scenarios.ts:316-322); `check` cannot see it.

## Representativeness

Virtual scrolling over a sorted list is common, and the question this row asks
(does the window cost grow with its depth) is the one that separates an index
from a rescan. At 200 rows per group it is asked at a small depth. Narrow: read
beside `scrollWindow`, which stays in the first two windows.

## The standing record, checked (READ_SCRIPT, scenarios.ts:315-386, signed at :315)

- A2 MET (:323-327): view B is redundant by construction, holds.
- B4 MET (:352-356): a scroll step delivers one window and `consumerFloor`
  divides the table (`read` is not a flag `stepDeliveryOf` reads, so the shape is
  `window`, floor.ts:76-87, 95). Holds.
- C5 NOT MET (:375-385): "four of the five read scripts perform no store
  mutation" matches `readByKey`, `scrollWindow`, `deepScroll` and `viewSwitch`
  against `filterTwoAxes`.