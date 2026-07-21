import { TOIMKey } from '../types/TOIMKey';
import { OIMEventEmitter } from '../core/OIMEventEmitter';
import { EOIMIndexEventType } from '../enums/EOIMIndexEventType';
import { TOIMIndexUpdatePayload } from '../types/TOIMIndexUpdatePayload';
import { TOIMPk } from '../types/TOIMPk';
import { TOIMIndexComparator } from '../types/TOIMIndexComparator';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';

export interface IOIMIndexStore<TKey, TBucket> {
    setOneByKey(key: TKey, bucket: TBucket): void;
    removeOneByKey(key: TKey): void;
    removeManyByKeys(keys: readonly TKey[]): void;
    getOneByKey(key: TKey): TBucket | undefined;
    getManyByKeys(keys: readonly TKey[]): Map<TKey, TBucket>;
    getAllKeys(): TKey[];
    getAll(): Map<TKey, TBucket>;
    countAll(): number;
    clear(): void;
}

export abstract class OIMIndex<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TBucket extends Iterable<TOIMAnyEntitySlot<TPk>>,
> {
    protected readonly comparePks?: TOIMIndexComparator<TPk>;
    protected readonly store: IOIMIndexStore<TKey, TBucket>;
    public readonly emitter = new OIMEventEmitter<{
        [EOIMIndexEventType.UPDATE]: TOIMIndexUpdatePayload<TKey>;
    }>();

    constructor(
        store: IOIMIndexStore<TKey, TBucket>,
        comparePks?: TOIMIndexComparator<TPk>
    ) {
        this.store = store;
        this.comparePks = comparePks;
    }

    protected abstract getBucketSize(bucket: TBucket): number;

    public hasKey(key: TKey): boolean {
        return this.store.getOneByKey(key) !== undefined;
    }

    public getKeys(): readonly TKey[] {
        return this.store.getAllKeys();
    }

    public getKeySize(key: TKey): number {
        const bucket = this.store.getOneByKey(key);
        return bucket ? this.getBucketSize(bucket) : 0;
    }

    public get size(): number {
        return this.store.countAll();
    }

    public get isEmpty(): boolean {
        return this.store.countAll() === 0;
    }

    public getEntitiesByKey<TEntity extends object = object>(
        key: TKey
    ): (TEntity | undefined)[] {
        const bucket = this.store.getOneByKey(key);
        return bucket ? this.slotsToEntities<TEntity>(bucket) : [];
    }

    public getEntitiesByKeys<TEntity extends object = object>(
        keys: readonly TKey[]
    ): Map<TKey, (TEntity | undefined)[]> {
        const result = new Map<TKey, (TEntity | undefined)[]>();
        const bucketsByKey = this.store.getManyByKeys(keys);
        for (const [key, bucket] of bucketsByKey) {
            result.set(key, this.slotsToEntities<TEntity>(bucket));
        }
        return result;
    }

    public getMetrics() {
        let totalPks = 0;
        let maxBucketSize = 0;
        let minBucketSize = Infinity;
        const all = this.store.getAll();

        for (const bucket of all.values()) {
            const size = this.getBucketSize(bucket);
            totalPks += size;
            maxBucketSize = Math.max(maxBucketSize, size);
            minBucketSize = Math.min(minBucketSize, size);
        }

        return {
            totalKeys: all.size,
            totalPks,
            averagePksPerKey: all.size > 0 ? totalPks / all.size : 0,
            maxBucketSize: maxBucketSize === -Infinity ? 0 : maxBucketSize,
            minBucketSize: minBucketSize === Infinity ? 0 : minBucketSize,
        };
    }

    public destroy(): void {
        this.emitter.offAll();
        this.store.clear();
    }

    protected emitUpdate(keys: TKey[]): void {
        this.emitter.emit(EOIMIndexEventType.UPDATE, { keys });
    }

    protected emitUpdateOne(key: TKey): void {
        this.emitUpdate([key]);
    }

    /**
     * Maps a bucket's slots to entities, preserving positional holes: a slot
     * whose entity is not present yet (reserved by an index ahead of its data)
     * or was removed yields `undefined` at its position rather than being
     * dropped. This keeps the result aligned with `getPksByKey`, so callers can
     * render a per-item loading/placeholder state instead of a silently shorter
     * list.
     */
    protected slotsToEntities<TEntity extends object>(
        slots: Iterable<TOIMAnyEntitySlot<TPk>>
    ): (TEntity | undefined)[] {
        const entities: (TEntity | undefined)[] = [];
        for (const slot of slots) {
            entities.push(slot.item as TEntity | undefined);
        }
        return entities;
    }
}
