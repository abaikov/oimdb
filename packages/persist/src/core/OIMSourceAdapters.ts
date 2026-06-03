import {
    EOIMCollectionEventType,
    EOIMIndexEventType,
    EOIMObjectEventType,
    TOIMAnyEntitySlot,
    TOIMPk,
} from '@oimdb/core';
import {
    TOIMPersistSourceAdapter,
    TOIMPersistUnsubscribe,
} from '../types/TOIMPersistResource';

type TOIMEmitter<TEvent extends PropertyKey> = {
    on(event: TEvent, handler: (...args: any[]) => void): TOIMPersistUnsubscribe;
};

export type TOIMCollectionPersistSnapshot<TPk extends TOIMPk, TEntity> = {
    records: Array<{
        pk: TPk;
        value: TEntity;
    }>;
};

export type TOIMObjectPersistSnapshot<TKey extends string, TValue> = Record<
    TKey,
    TValue
>;

export type TOIMIndexPersistSnapshot<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    buckets: Array<{
        key: TKey;
        pks: TPk[];
    }>;
};

export type TOIMCollectionPersistSource<TEntity extends object, TPk extends TOIMPk> = {
    selectPk(entity: TEntity): TPk;
    getAll(): TEntity[];
    clear(): void;
    upsertMany(entities: TEntity[]): unknown;
    /**
     * Queue-integrated subscription: fires once per queue flush with the
     * changed PKs. Used by OIMReactiveCollection. Preferred over `emitter`
     * when available — no need for a separate dirty flag since the reactive
     * collection already accumulates changes internally.
     */
    subscribeOnAnyUpdate?: (handler: (pks: readonly TPk[]) => void) => () => void;
    /** Raw synchronous emitter — fallback for non-reactive OIMCollection. */
    emitter?: TOIMEmitter<typeof EOIMCollectionEventType.UPDATE>;
};

export type TOIMObjectPersistSource<TKey extends string, TValue> = {
    getAll(): Record<TKey, TValue>;
    clear(): void;
    merge(draft: Partial<Record<TKey, TValue>>): void;
    emitter?: TOIMEmitter<typeof EOIMObjectEventType.UPDATE>;
};

export type TOIMSetIndexPersistSource<TKey extends TOIMPk, TPk extends TOIMPk> = {
    getKeys(): readonly TKey[];
    getPksByKey(key: TKey): ReadonlySet<TPk>;
    clear(key?: TKey): void;
    setSlots(key: TKey, slots: Iterable<TOIMAnyEntitySlot<TPk>>): void;
    emitter?: TOIMEmitter<typeof EOIMIndexEventType.UPDATE>;
};

export type TOIMArrayIndexPersistSource<TKey extends TOIMPk, TPk extends TOIMPk> = {
    getKeys(): readonly TKey[];
    getPksByKey(key: TKey): readonly TPk[];
    clear(key?: TKey): void;
    setSlots(key: TKey, slots: TOIMAnyEntitySlot<TPk>[]): void;
    emitter?: TOIMEmitter<typeof EOIMIndexEventType.UPDATE>;
};

export type TOIMOrderedArrayIndexPersistSource<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    getKeys(): readonly TKey[];
    getPksByKey(key: TKey): readonly TPk[];
    clear(key?: TKey): void;
    reset?: (key: TKey, pks: readonly TPk[]) => void;
    resetSlots?: (key: TKey, slots: readonly TOIMAnyEntitySlot<TPk>[]) => void;
    setSlots?: (key: TKey, slots: TOIMAnyEntitySlot<TPk>[]) => void;
    emitter?: TOIMEmitter<typeof EOIMIndexEventType.UPDATE>;
};

export function createCollectionSourceAdapter<
    TEntity extends object,
    TPk extends TOIMPk,
>(
    collection: TOIMCollectionPersistSource<TEntity, TPk>
): TOIMPersistSourceAdapter<TOIMCollectionPersistSnapshot<TPk, TEntity>> {
    return {
        read() {
            return {
                records: collection.getAll().map(entity => ({
                    pk: collection.selectPk(entity),
                    value: entity,
                })),
            };
        },
        write(snapshot) {
            collection.clear();
            if (snapshot.records.length === 0) return;
            collection.upsertMany(snapshot.records.map(record => record.value));
        },
        subscribe(onChange) {
            // Prefer queue-integrated subscription (OIMReactiveCollection).
            // The reactive collection already accumulates dirty PKs internally;
            // no separate flag needed on our side.
            if (collection.subscribeOnAnyUpdate) {
                return collection.subscribeOnAnyUpdate(() => onChange());
            }
            return collection.emitter
                ? collection.emitter.on(EOIMCollectionEventType.UPDATE, onChange)
                : noop;
        },
    };
}

export function createObjectSourceAdapter<TKey extends string, TValue>(
    object: TOIMObjectPersistSource<TKey, TValue>
): TOIMPersistSourceAdapter<TOIMObjectPersistSnapshot<TKey, TValue>> {
    return {
        read() {
            return object.getAll();
        },
        write(snapshot) {
            object.clear();
            object.merge(snapshot);
        },
        subscribe(onChange) {
            return object.emitter
                ? object.emitter.on(EOIMObjectEventType.UPDATE, onChange)
                : noop;
        },
    };
}

export function createSetIndexSourceAdapter<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
>(
    index: TOIMSetIndexPersistSource<TKey, TPk>
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return createIndexSourceAdapter(index, (key, pks) => {
        index.setSlots(key, new Set(pks.map(createSlot)));
    });
}

export function createArrayIndexSourceAdapter<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
>(
    index: TOIMArrayIndexPersistSource<TKey, TPk>
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return createIndexSourceAdapter(index, (key, pks) => {
        index.setSlots(key, pks.map(createSlot));
    });
}

export function createOrderedArrayIndexSourceAdapter<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
>(
    index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return createIndexSourceAdapter(index, (key, pks) => {
        if (index.reset) {
            index.reset(key, pks);
        } else if (index.resetSlots) {
            index.resetSlots(key, pks.map(createSlot));
        } else if (index.setSlots) {
            index.setSlots(key, pks.map(createSlot));
        } else {
            throw new Error(
                '[OIMPersist]: ordered array index must expose reset, resetSlots, or setSlots.'
            );
        }
    });
}

function createIndexSourceAdapter<TKey extends TOIMPk, TPk extends TOIMPk>(
    index: {
        getKeys(): readonly TKey[];
        getPksByKey(key: TKey): Iterable<TPk>;
        clear(key?: TKey): void;
        emitter?: TOIMEmitter<typeof EOIMIndexEventType.UPDATE>;
    },
    writeBucket: (key: TKey, pks: TPk[]) => void
): TOIMPersistSourceAdapter<TOIMIndexPersistSnapshot<TKey, TPk>> {
    return {
        read() {
            return {
                buckets: index.getKeys().map(key => ({
                    key,
                    pks: Array.from(index.getPksByKey(key)),
                })),
            };
        },
        write(snapshot) {
            index.clear();
            for (let i = 0; i < snapshot.buckets.length; i++) {
                const bucket = snapshot.buckets[i];
                writeBucket(bucket.key, bucket.pks);
            }
        },
        subscribe(onChange) {
            return index.emitter
                ? index.emitter.on(EOIMIndexEventType.UPDATE, onChange)
                : noop;
        },
    };
}

function createSlot<TPk extends TOIMPk>(pk: TPk): TOIMAnyEntitySlot<TPk> {
    return { pk, item: undefined };
}

function noop(): void {
    return undefined;
}
