---
participant: "baseline-indexed"
version: "0"
auditedAt: "2026-10-17"
auditedBy: "claude-opus-5-5 (verified)"
digest: "d5f01db176cd9452"
verdict: "idiomatic"
summary: "baseline-array plus an unordered row bucket per group and the set of buckets written since the last settle; a settle re-derives only the views over those buckets, so under the fifty-view wiring a one-row move re-renders one group, and nothing routes by column. Every churn shape is declined, the diamond included, as are relations and single."
wirings:
  bind:
    verdict: "idiomatic"
    note: "Map plus an unordered array bucket per group kept on write (baseline-array-indexed.ts:42-59, 102-166); every write adds the group it touched to dirtyGroups, both groups for a row that changed group (113-117, 153-159), and the settle renders the views whose group is in the set, then clears it (69-88, 192-196). The render runs the shared top-k over the view's own bucket (77-86). A patchNote still re-renders the view over its row's group (142-147): the bucket knows the row, not the column, and column routing is left out on purpose (baseline-array-indexed.md, 'What the index is, and what is part of it'). A write to a key the store does not hold marks nothing (137-138 and the same guard in each patch), where baseline-array sets dirty anyway; no view's content can change in that case. Once pinned, any dirty group re-delivers both cell views (90-97, 181-190). frame calls run() (191)."
  bindPerGroup:
    verdict: "idiomatic"
    note: "The same body with fifty views (404). consumerPerGroup moves one row's rank in one group per step, so one bucket is dirty and one view is re-derived and delivered per step. This is the competent hand-written arm admission names (387-390)."
  churn.row:
    verdict: "declined"
    note: "Declined by noChurn (405-411): a churn binding derives no view, so the group index has nothing to do and the row would be baseline-array's churn store under a second name."
  churn.wide:
    verdict: "declined"
    note: "The same declaration as churn.row (noChurn, 405); justified for the same reason."
  churn.column:
    verdict: "declined"
    note: "The same declaration as churn.row (noChurn, 405); justified for the same reason."
  churn.chain:
    verdict: "declined"
    note: "The same declaration as churn.row (noChurn, 405); justified for the same reason. chainFrameWrite, a churn.chain script, has no row here either."
  churn.diamond:
    verdict: "declined"
    note: "The same declaration as churn.row (noChurn, 405; noChurn declines all five shapes, harness/types.ts:106-112). A diamond over one row is a derived value, not a view over a group, so the bucket is not involved and the row would be baseline-array's diamond callback."
  reads.byKey:
    verdict: "idiomatic"
    note: "One Map get per key (334-342), identical to baseline-array; the index is not involved. frame calls run() (331)."
  reads.byWindow:
    verdict: "idiomatic"
    note: "scrollTo sets an offset and dirty (346-349); the settle selects top-(offset+window) out of view A's bucket and delivers the tail (254-269, 356-360). The read binding keeps one dirty flag rather than a bucket set (departure, 383-385; baseline-array-indexed.md, 'What the index is'). The bucket keeps no order, so each scroll re-selects; the md declines a sort on purpose, so that the anchor gap prices the index and not an index plus a sort."
  reads.byTwoAxes:
    verdict: "idiomatic"
    note: "Axis clause over group A's bucket (263-268), fixed on view.groupA whatever view A shows."
  reads.bySwitch:
    verdict: "idiomatic"
    note: "switchGroup sets the group view A reads (pagedGroup, 235), offset 0, and dirty (350-355); the settle selects from that group's bucket (259), which write already keeps, so a switch fills nothing and costs one selection over one bucket. View B is re-delivered on the same flag with unchanged content, one redundant delivery per viewSwitch step; the check asks only that B's distinct renders stay 0 (scenarios.ts:4551-4554). After a switch the one dirty flag re-delivers both views on any write, the unwritten one as a redundant delivery (baseline-array-indexed.md). Not run."
  relations:
    verdict: "declined"
    note: "Declined by noRelations (418-426): the relation binding has no group or window, so this row would repeat baseline-array's relation store."
  single:
    verdict: "declined"
    note: "Declined by noSingle (427-436): nothing to group."
improvements: []
---

## What this row is

`packages/bench/src/adapters/baseline-array-indexed.ts` is `baseline-array` with a group index:
a per-group array bucket (42-59) maintained in `write` (102-124), `remove` (125-133) and `setGroup`
(150-160), and the set of groups written since the last settle (69). Order is kept nowhere; each
render selects its window from the bucket with the same top-k the other anchor runs over the
population (73-88). Version `"0"` is the adapter's `version` (376); no library is involved.
`frame` is `run()` in both bindings (191, 331).

## Is it what a competent developer writes

Yes for the two things a person keeping a bucket per group writes together: the bucket, and the
knowledge of which buckets moved. A label write in group A re-renders group A alone, and under
`bindPerGroup` (404) a single-row move re-renders one group of fifty. The companion note
(`baseline-array-indexed.md`) states what is left out so the `indexed − lean` gap carries nothing
else: no column routing, no coalescing beyond the settle, no sort.

A view switch is a key and an offset (350-355): every group's bucket already exists because `write`
files every row, which is the hand-written cost of a group index and the reason a switch here is
cheap.

`leave` is `indexOf` plus `splice` over a bucket of roughly a group's size (53-59); the md
('Why the bucket is an array and not a set') argues the array over a `Set` and leaves it open.

## Is it artificially fast

No. Every write goes through `byId.get`, and `readKeys` resolves nothing in advance (334-342). A
settle skips a view only when no write touched its group, and a view's rows are by construction the
rows of its group, so no skipped view could have changed.

## The declines

All five churn shapes, `relations` and `single` are declined (405-436) with the argument that no
group index exists in those wirings, so the code would be byte-for-byte baseline-array's. That
reason is about this row's purpose, not a library capability, and it holds: the bindings would be
identical. Every read shape is supplied (415-417).

## Not verified

- Whether a `Set` bucket would be faster here was not measured.
- Nothing was run; the viewSwitch check was read against this wiring, not executed.
