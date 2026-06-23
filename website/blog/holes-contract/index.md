---
slug: holes-contract
title: "getEntitiesByKey returns holes on purpose"
authors: [oimdb]
tags: [internals, indexes]
date: 2026-06-12
---

`index.getEntitiesByKey(key)` returns `(TEntity | undefined)[]`, aligned 1:1 with `getPksByKey(key)`. The `undefined`s are the contract, not a bug.

{/* truncate */}

## Context

An index maps a key (say `teamId`) to the entities under it. Each bucket stores *slots* — `{ pk, item }` wrappers shared with the collection — so a read returns either the pks (`getPksByKey`) or the entities (`getEntitiesByKey`).

## Problem

An index bucket holds slots `{ pk, item }`; `item` is `undefined` when the pk is reserved but its entity hasn't arrived yet (or was removed) — e.g. message ids indexed before the bodies load.

On read, dropping the empty slots makes the entity array shorter than the pk array, so position `N` no longer matches. That breaks any index→row mapping (virtual lists).

## Options

- **Compaction** — drop empty slots. Breaks positional alignment, hides "loading".
- **Throw / filter at the boundary** — pushes an existence check onto every caller, still loses position.
- **Holes** — one entry per slot, `undefined` where absent. Stays 1:1 with the pks (LEFT JOIN → NULLs).

## What OIMDB does

`OIMIndex.slotsToEntities` pushes `slot.item` for every slot, including the `undefined` ones. So `getPksByKey(key)[i]` and `getEntitiesByKey(key)[i]` are the same row: a virtual list renders `pks.length` rows and shows a skeleton where the entity is `undefined`.

The non-obvious payoff is that the hole *is* the loading signal. The instinct — and what a normalizer returning "the entities for this key" usually does — is to surface only the entities that exist. That quietly throws away two things: the row's position, and the fact that the row exists but hasn't loaded yet. With holes the index doubles as a presence map: a known pk with no entity is exactly a hole, so the consumer needs no parallel "which of these are still loading" structure kept in sync with the list. Position carries the identity (`pks[i]`), the hole carries the state.

## Cost

Callers must handle `undefined` — TypeScript forces narrowing, mildly annoying when everything is loaded. The alternative, `TEntity[]` sometimes shorter than its own key list, loses the alignment and gives no signal about which rows are missing — pushing the caller back to a side structure to track partial loads.

## Where it lives

- `packages/core/src/abstract/OIMIndex.ts` (`slotsToEntities`, `getEntitiesByKey`)
- `packages/core/src/types/TOIMEntitySlot.ts` (the `item: TEntity | undefined` slot)
