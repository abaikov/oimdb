import { EOIMIndexEventType, TOIMAnyEntitySlot, TOIMPk } from '@oimdb/core';
import { TOIMEmitter } from './TOIMEmitter';

export type TOIMOrderedArrayIndexPersistSource<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    // `TPk` is inferred solely from the covariant `getPksByKey()` return; the
    // contravariant write payloads are wrapped in `NoInfer` so a concrete index
    // with a wider slot type cannot widen the inferred pk type.
    getKeys(): readonly TKey[];
    getPksByKey(key: TKey): readonly TPk[];
    clear(key?: TKey): void;
    reset?: (key: TKey, pks: readonly NoInfer<TPk>[]) => void;
    resetSlots?: (
        key: TKey,
        slots: readonly TOIMAnyEntitySlot<NoInfer<TPk>>[]
    ) => void;
    setSlots?: (key: TKey, slots: TOIMAnyEntitySlot<NoInfer<TPk>>[]) => void;
    emitter?: TOIMEmitter<typeof EOIMIndexEventType.UPDATE>;
};
