# `OIMGlobalIndexManualArrayBased` — prose moved out of the source

Every block below stood in `OIMGlobalIndexManualArrayBased.ts` and is reproduced verbatim,
with the declaration it stood over.

## Over `export class OIMGlobalIndexManualArrayBased`

Manual array-based keyless index — direct raw-slot control of the single
ordered bucket. Mirrors {@link OIMIndexManualArrayBased} minus the key.

## Over `public appendSlots(slots)`

Appends pre-deduplicated slots to the bucket IN PLACE and emits once.
O(added). Callers own dedup (used by collection-bound `addPks`).
