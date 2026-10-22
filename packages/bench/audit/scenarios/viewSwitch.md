---
scenario: "viewSwitch"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "bda06b8a1737f29b"
verdict: "representative"
models: "A user switching tab or filter: the list view re-points to a different group of already-loaded rows and shows its first page."
measures: "The cost of changing what a mounted view selects on, with no data written: reading another group's ordered first window and delivering it, eight times."
favours:
  - "Stores that keep every group indexed and ordered at write time (a bucket per group plus an ordered list), so a switch reads an existing structure. Both anchors are present for this: the lean anchor rescans the whole population (adapters/baseline-array.ts:286-294, 373-377), the indexed one re-selects from the new group's unordered bucket (adapters/baseline-array-indexed.ts:254-262, 351-355)."
  - "Against stores whose view is a query object fixed at construction: TanStack DB builds a new live query per switch (adapters/tanstack-db.ts:850-856), TinyBase re-runs a parameterised query (adapters/tinybase.ts:930-934), LokiJS replaces the DynamicView's filter (adapters/lokijs.ts:615-619). That is how those libraries are used, so the cost is theirs."
  - "Against stores that subscribe per visible row and must re-point every subscription on a switch (oimdb's view holds the new group's bucket and order and releases the old ones per switch, then re-points its per-row effects, adapters/oimdb.ts:842-852, 347-383)."
biases:
  - "THE SAME SEVEN GROUPS EVERY RUN. `switchGroups` is fixed by the plan (dataset.ts:889-899): g2, g8, g14, g20, g26, g32, g38, then g0 at the default 50 groups. Each timed sample revisits them, so any per-group result a library keeps alive across switches is warm from the second sample on. Whether any library here does so was not checked; the standing forbids it for adapters (A1, B3, scenarios.ts:4473-4477, 4502-4506) and nothing in `check` can see it."
  - "Nothing is written and every group is already resident and of equal size (about 200 rows, dataset.ts:434-454, guard at :759-770). A real switch often coincides with a fetch; this is the in-memory half."
  - "Every switch lands at offset 0 (`TReadBinding.switchGroup`, types.ts:147-149). A switch that keeps a scroll position is not asked."
  - "View B is fixed over group A on the second axis (oracle.ts:360-363). Its silence is free for every store that does not re-run all views on any change; both anchors re-render B on every settle (adapters/baseline-array.ts:295-300; adapters/baseline-array-indexed.ts:263-268) and pay it as redundant deliveries, which `check` permits."
summary: "A tab or filter switch over resident data; it prices re-selection on a moving view definition, and a library that kept per-group results warm across the fixed sequence would pass unseen."
---

## What the script does

`SWITCH_STEPS` = 8 (dataset.ts:205). Each step calls `switchGroup(group)` on the
read binding and settles (scenarios.ts:4543-4550). `switchStride` =
floor(48 / 7) = 6, so the groups are `GROUP_NAMES[2 + 6i]` for i < 7 and then
group A (dataset.ts:889-899); no group repeats and none is a watched group until
the return. `restore` switches back to group A (scenarios.ts:4539-4542), so a run
ends where it began.

## What `check` and the oracle prove

`check` (scenarios.ts:4551-4554): view A distinct renders = 8, the final view A
row count = `WINDOW`, view B distinct = 0. The oracle sends
`windowOf(group)` — filter, sort, slice, independent of `visibleInto`
(oracle.ts:266-276) — to view A once per step (scenarios.ts:4555-4558), and the
digest is compared in both passes (worker.ts:515-530 in verify, 647-656 in the
timed process's proof pass). A wrong group, a short window or an intermediate state
(an empty initial query result, say) changes the digest or the distinct count.

## Ways a broken store passes

- **A cached answer.** A window kept per group from earlier samples renders the
  identical text. The digest cannot distinguish "asked the store" from "kept the
  answer"; only the adapter cards can.
- **Deliveries to view A are not counted**, only distinct renders. A store that
  delivered the same window twice per switch passes; that is permitted and
  printed.
- The final row count is read at group A only; intermediate windows' fullness is
  proved by the digest, not by `check`.

## Representativeness

Switching tabs or filters over loaded data is among the most common view changes
in a client, at roughly this size (10 000 rows, 50 groups, a 32-row page). The
fixed revisiting sequence is the one construction that could flatter a caching
library.

## The standing record, checked (own record, scenarios.ts:4472-4533)

- A1 and B3 MET (:4473-4477, :4502-4506) are promises about adapters; nothing in
  the script enforces them (see biases).
- B4 MET (:4507-4510): `stepDeliveryOf` returns `window` (floor.ts:86) and
  `consumerFloor` divides the table (floor.ts:95). Each step delivers one full
  window, so the floor is a bound on it.
- C5 NOT MET (:4527-4532) agrees with `control-write` declining every read shape
  (control.ts:1265-1271).
- No participant declines `reads.bySwitch`: `readShapes` declines a shape only when
  given a reason (types.ts:170-182), and the one adapter that passes one,
  tanstack-db's plain row, declines `byWindow` only (adapters/tanstack-db.ts:1386-1389).
  So all 18 registered adapters (registry.ts:32-51) have a row.
