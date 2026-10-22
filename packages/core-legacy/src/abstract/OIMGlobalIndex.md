# `OIMGlobalIndex` — prose moved out of the source

Every block below stood in `OIMGlobalIndex.ts` and is reproduced verbatim, with the
declaration it stood over.

## Over `export abstract class OIMGlobalIndex`

Keyless base index: a single bucket of entity slots over the whole collection
("all"), with no key dimension. Mirrors {@link OIMIndex} but holds ONE bucket
directly instead of a `Map<key, bucket>`, so there is no key parameter
anywhere on its surface. Concrete shape (ordered array vs unordered set) is
added by {@link OIMGlobalIndexArrayBased} / {@link OIMGlobalIndexSetBased}.

## Over `public abstract getPks()`

The bucket's pks / slots, in this index's own read shape.

## Over `public getEntities()`

Materializes the bucket to entities, preserving positional holes: a slot
whose entity is not present yet (or was removed) yields `undefined` at its
position rather than being dropped — mirroring {@link OIMIndex}.
