import { EOIMIndexEventType, TOIMAnyEntitySlot, TOIMPk } from '@oimdb/core';
import { TOIMEmitter } from './TOIMEmitter';

export type TOIMSetIndexPersistSource<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    // `TPk` is inferred solely from the covariant `getPksByKey()` return; the
    // contravariant `setSlots()` payload is wrapped in `NoInfer` so a concrete
    // index with a wider slot type cannot widen the inferred pk type.
    getKeys(): readonly TKey[];
    getPksByKey(key: TKey): ReadonlySet<TPk>;
    clear(key?: TKey): void;
    setSlots(key: TKey, slots: Iterable<TOIMAnyEntitySlot<NoInfer<TPk>>>): void;
    emitter?: TOIMEmitter<typeof EOIMIndexEventType.UPDATE>;
};
