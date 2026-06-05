import { EOIMObjectEventType } from '@oimdb/core';
import { TOIMEmitter } from './TOIMEmitter';

export type TOIMObjectPersistSource<TKey extends string, TValue> = {
    // `TKey`/`TValue` are inferred solely from the covariant `getAll()`; the
    // contravariant `merge()` is wrapped in `NoInfer` so a concrete object whose
    // `merge` accepts a wider draft cannot widen the inferred value type.
    getAll(): Record<TKey, TValue>;
    clear(): void;
    merge(draft: NoInfer<Partial<Record<TKey, TValue>>>): void;
    emitter?: TOIMEmitter<typeof EOIMObjectEventType.UPDATE>;
};
