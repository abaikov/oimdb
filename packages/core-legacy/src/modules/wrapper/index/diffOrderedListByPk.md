# `diffOrderedListByPk` — prose moved out of the source

Every block below stood in `diffOrderedListByPk.ts` and is reproduced verbatim, with the
declaration or statement it stood over. Two blocks stayed in the source: the removals loop's
reason for walking high index → low, and the `tails[k]` definition, both of which state what
the line under them means rather than restating it.

## Over `export function diffOrderedListByPk`

Diff two ordered lists of pk-identified items into position-addressed
commands (`insert` / `remove` / `move`) that transform `prev` into `next`.

Identity is `item.pk`; content is not compared (a reordered same-pk item is a
`move`, never recreated). Correctness is by construction: commands are emitted
against a working copy that mirrors what a consumer applying them holds, so
`applyCommands(prev, diffOrderedListByPk(prev, next))` equals `next` by pk.

Moves are minimal. A longest-increasing-subsequence pass finds the common
items already in relative order — those stay; every other common item moves
exactly once, so the move count is `commonCount − LIS` (the optimum). This is
the standard keyed reconciliation used by imperative DOM renderers: each
non-anchor item is placed immediately before the already-positioned item to
its right (`next[j + 1]`), processed right → left.

It intentionally does NOT emit `reset`; callers decide when a whole reset is
cheaper (see `OIMOrderedListCommandStreamDiffDriven`). Complexity is O(n·m)
worst case (an index scan per placed item), acceptable for the moderate bucket
sizes indexes produce, where it runs only on an actual change.

## After the removals loop

`working` now holds exactly the common items, in `prev` order.

## Over the anchors pass

2) Anchors — common items whose relative order already matches `next`
   (the LIS of their `working` positions taken in `next` order). Anchors
   are never moved; everything else moves exactly once.

## Over the placement loop

3) Place right → left. Each non-anchor item (new, or a moved common) goes
   immediately before `next[j + 1]`, which is already in place; anchors are
   left untouched — the placements around them shift them into position.

## Over `function longestIncreasingSubsequence`

Indices into `seq` forming a longest strictly-increasing subsequence
(O(n log n) patience sorting with predecessor links). `seq` values are
distinct here (each pk maps to one position), so "strictly" is exact.
