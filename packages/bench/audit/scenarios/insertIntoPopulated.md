---
scenario: "insertIntoPopulated"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "c77f3afa1df769f5"
verdict: "representative"
models: "A page of new items arriving into a populated, newest-first list (a feed refresh, new orders, new messages) in one frame."
measures: "Insert of genuinely new keys into a full store with fifty ordered groups and live subscriptions, and the re-derivation of every affected window."
favours:
  - "Stores with an ordered per-group index that can place a new row by binary search, over stores that rescan or re-sort the group."
  - "For array-backed ordered buckets, arrival at position 0 is the most expensive splice position (all rows shift); for linked or tree-backed orders it is not special. The engine's ordered bucket inserts by `splice` (packages/core/src/engine/bucket/array/OIMBucketSlotsServiceArrayDriven.ts:154)."
biases:
  - "Every new row ranks below every stored row (`rank: -(i + 1)`, dataset.ts:909-915), so each arrives at the HEAD of its group's window (scenarios.ts:3900-3903). Realistic for newest-first lists; it never asks for a mid-order insert, and it guarantees every window changes."
  - "100 rows at the default point, two per group (`INSERT_COUNT`, dataset.ts:215). A modest page; a large page into a large store is asked by `growUnderSubscription`."
  - "One `write(rows)` call (scenarios.ts:3932-3935): adapters can batch inside it; eager and deferred stores are on equal terms."
  - "The untimed restore removes the rows (scenarios.ts:3928-3931), so the store never grows; a store whose removal leaves residue (tombstones, holes in arrays) is measured in its post-removal state on every sample after the first. Direction unverified."
summary: "A realistic feed-style insert into a populated store; its newest-first ranks fix the arrival position at the head."
---

## What the script does

One step: `write(ctx.insertRows)` (`INSERT_COUNT` = max(2·GROUPS, 2·WINDOW) = 100
rows with ids no stored row has, dataset.ts:215, 909-915; cloned once by the worker
as `insertRows`), then one `settle()` (scenarios.ts:3932-3935). `check`: view A holds
`min(WINDOW, groupSize + 2)` rows and view B a full window, view A's head is an
inserted row (`f` prefix), at least one delivery per view (scenarios.ts:3944-3956).
`finalStateOnly` (scenarios.ts:3921); `repeatable: false` (:3924).

## Representativeness

Inserting a page of new items into a list that already holds many is ordinary
(pagination, live feeds, "load newer"). Newest-first ordering is typical for feeds
and inboxes. js-framework-benchmark's "append 1,000 rows" is the opposite end of the
order (tail). This suite asks the head only.

## The standing record, checked

`ORDINARY_SCRIPT` (scenarios.ts:86-169, signed at :98). Holds for this script.