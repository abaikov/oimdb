import { TOIMKey } from '../types/TOIMKey';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import {
    TOIMDerivedCollectionIndexArrayBasedOptions,
    TOIMDerivedEntityComparator,
    TOIMDerivedEntityOrderSelector,
    TOIMDerivedEntityOrderValue,
    TOIMDerivedIndexKeySelector,
} from '../types/TOIMCollectionIndexOptions';
import { TOIMAnyEntitySlot, TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMReactiveCollectionIndexManualArrayBased } from './OIMReactiveCollectionIndexManualArrayBased';

/**
 * Collection-bound Array-based index derived from entity data.
 *
 * It maintains ordered per-key arrays automatically from collection updates.
 * Use `orderBy` or `compareEntities` when list order matters.
 */
export class OIMDerivedCollectionIndexArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveCollectionIndexManualArrayBased<TKey, TPk, TEntity> {
    private readonly collection: OIMReactiveCollection<TEntity, TPk>;
    /**
     * Bits of the fields this index depends on, or `undefined` when it depends on
     * everything. Resolved once at construction against the collection's registry
     * so the hot path is a single AND.
     */
    protected readonly depsMask?: number;

    /**
     * True when this write cannot possibly concern us: we declared our fields,
     * the collection recorded which ones a write touched, and they do not
     * overlap. Skipping here avoids the selector call and the set allocations
     * that would otherwise be spent proving the membership is unchanged.
     */
    protected isIrrelevantWrite(slot: TOIMAnyEntitySlot<TPk> | undefined): boolean {
        const deps = this.depsMask;
        if (deps === undefined || slot === undefined) return false;
        const written = slot.dirtyFields;
        // No record for this slot means "unknown" — never skip on a guess.
        if (written === undefined) return false;
        return (written & deps) === 0;
    }

    /** Resolve declared field names into a mask, refusing a collection that cannot track them. */
    protected static resolveDepsMask(
        collection: { fields?: { maskOf(fields: Iterable<string>): number } },
        deps: readonly string[] | undefined,
        indexName: string
    ): number | undefined {
        if (deps === undefined || deps.length === 0) return undefined;
        const registry = collection.fields;
        if (!registry) {
            throw new Error(
                `[${indexName}]: \`deps\` was declared (${deps.join(', ')}) but this collection ` +
                    'does not track fields, so the declaration could never be honoured. Build the ' +
                    'collection with `slotWriter: new OIMSlotWriterFieldMasked(queue, updater)`, or ' +
                    'drop `deps`.'
            );
        }
        return registry.maskOf(deps);
    }


    private readonly selectIndexKeys: TOIMDerivedIndexKeySelector<
        TEntity,
        TKey
    >;
    private readonly compareEntities?: TOIMDerivedEntityComparator<TEntity>;
    private readonly orderBy?: TOIMDerivedEntityOrderSelector<TEntity>;
    private readonly unsubscribeFromCollection: () => void;
    private readonly keysByPk = new Map<TPk, Set<TKey>>();
    // Last known sort value per pk (only when `orderBy` is used), so an update
    // touching an unrelated field can skip re-sorting when the value is unchanged.
    private readonly orderValueByPk = new Map<TPk, TOIMDerivedEntityOrderValue>();

    constructor(
        queue: OIMEventQueue,
        collection: OIMReactiveCollection<TEntity, TPk>,
        opts: TOIMDerivedCollectionIndexArrayBasedOptions<TEntity, TKey, TPk>
    ) {
        super(queue, {
            collection,
            indexOptions: opts.indexOptions,
        });
        this.collection = collection;
        this.depsMask = OIMDerivedCollectionIndexArrayBased.resolveDepsMask(
            collection,
            opts.deps,
            'OIMDerivedCollectionIndexArrayBased'
        );
        this.selectIndexKeys = opts.selectIndexKeys;
        this.compareEntities = opts.compareEntities;
        this.orderBy = opts.orderBy;
        this.unsubscribeFromCollection = collection.batchEmitter.on(
            EOIMCollectionEventType.UPDATE,
            payload => this.onCollectionUpdate(payload.pks)
        );

        if (opts.buildInitial !== false) {
            this.rebuildFromCollection();
        }
    }

    public rebuildFromCollection(): void {
        this.keysByPk.clear();
        this.orderValueByPk.clear();
        super.clear();

        const slotsByKey = new Map<TKey, TOIMEntitySlot<TEntity, TPk>[]>();
        const slots = this.collection.getAllSlots();

        for (const slot of slots) {
            if (slot.item === undefined) continue;
            const keys = this.normalizeKeys(this.selectIndexKeys(slot.item));
            if (keys.length === 0) continue;

            this.keysByPk.set(slot.pk, new Set(keys));
            if (this.orderBy) {
                this.orderValueByPk.set(slot.pk, this.orderBy(slot.item));
            }
            for (const key of keys) {
                let slotsForKey = slotsByKey.get(key);
                if (!slotsForKey) {
                    slotsForKey = [];
                    slotsByKey.set(key, slotsForKey);
                }
                slotsForKey.push(slot);
            }
        }

        for (const [key, keySlots] of slotsByKey) {
            this.setSlots(key, this.sortSlots(keySlots));
        }
    }

    public override clear(key?: TKey): void {
        if (key === undefined) {
            this.keysByPk.clear();
            this.orderValueByPk.clear();
        } else {
            for (const keys of this.keysByPk.values()) {
                keys.delete(key);
            }
        }
        super.clear(key);
    }

    public override destroy(): void {
        this.unsubscribeFromCollection();
        this.keysByPk.clear();
        this.orderValueByPk.clear();
        super.destroy();
    }

    private readonly onCollectionUpdate = (pks: readonly TPk[]): void => {
        // `pks` always enumerates exactly the changed keys (clear() lists every
        // removed key), so removals flow through the normal per-key path below.
        const ordered = Boolean(this.compareEntities || this.orderBy);
        // Keys whose bucket order must be recomputed, and why. A key that only
        // gained members keeps its existing slots in order, so the newcomers can
        // be merged into an already-sorted array instead of re-sorting it; a key
        // whose member MOVED has no such invariant and needs a real sort.
        // Removal-only keys keep their order and are not listed at all.
        const keysToSort = ordered
            ? new Map<TKey, { added: TPk[]; moved: boolean }>()
            : null;
        const touch = (key: TKey): { added: TPk[]; moved: boolean } => {
            let entry = keysToSort!.get(key);
            if (!entry) {
                entry = { added: [], moved: false };
                keysToSort!.set(key, entry);
            }
            return entry;
        };

        for (const pk of pks) {
            const slot = this.collection.getSlotByPk(pk);
            // Declared deps and none of them written → neither membership nor
            // order can have moved, so skip the whole per-pk sync.
            if (this.isIrrelevantWrite(slot)) continue;
            const prevKeys = this.keysByPk.get(pk) ?? new Set<TKey>();
            const entity = slot?.item;
            const nextKeys =
                entity === undefined
                    ? new Set<TKey>()
                    : new Set(this.normalizeKeys(this.selectIndexKeys(entity)));

            // Did this entity's sort position possibly change?
            let orderChanged = false;
            if (this.orderBy) {
                if (entity === undefined || nextKeys.size === 0) {
                    this.orderValueByPk.delete(pk);
                } else {
                    const value = this.orderBy(entity);
                    orderChanged =
                        !this.orderValueByPk.has(pk) ||
                        this.orderValueByPk.get(pk) !== value;
                    this.orderValueByPk.set(pk, value);
                }
            } else if (this.compareEntities && entity !== undefined) {
                // A custom comparator may depend on any field — be conservative.
                orderChanged = true;
            }

            // Removed keys: drop membership; order of the remaining slots is kept.
            for (const key of prevKeys) {
                if (!nextKeys.has(key)) this.removePks(key, [pk]);
            }

            // Added / retained keys.
            if (entity !== undefined) {
                for (const key of nextKeys) {
                    if (!prevKeys.has(key)) {
                        this.addPks(key, [pk]); // new member needs ordering
                        if (keysToSort) touch(key).added.push(pk);
                    } else if (orderChanged) {
                        // Same member, position moved: the bucket is no longer
                        // sorted anywhere, so a merge cannot rescue it.
                        if (keysToSort) touch(key).moved = true;
                    }
                }
            }

            if (nextKeys.size === 0) this.keysByPk.delete(pk);
            else this.keysByPk.set(pk, nextKeys);
        }

        // Reorder only the touched buckets, reading each bucket's own slots
        // (O(bucket)) rather than scanning the whole collection per key.
        if (keysToSort) {
            for (const [key, { added, moved }] of keysToSort) {
                const slots = this.index.getSlotsByKey(key);
                this.setSlots(
                    key,
                    moved
                        ? this.sortSlots(slots)
                        : this.mergeAddedSlots(slots, added)
                );
            }
        }
    };

    /**
     * Insert the newly added slots into a bucket whose other members are already
     * in order. `addPks` appends, so the bucket is "sorted prefix + newcomers";
     * pulling the newcomers out and binary-searching each back in costs
     * O(bucket + added·log bucket) instead of a full O(bucket·log bucket) sort
     * with a comparator call per comparison.
     */
    private mergeAddedSlots(
        slots: readonly TOIMAnyEntitySlot<TPk>[],
        added: readonly TPk[]
    ): TOIMAnyEntitySlot<TPk>[] {
        if (!this.compareEntities && !this.orderBy) return slots.slice();
        // One newcomer into an empty or single-element bucket is already sorted;
        // anything larger still beats sorting, but only once there is a prefix.
        if (added.length === 0) return slots.slice();

        const addedPks = new Set(added);
        const sorted: TOIMAnyEntitySlot<TPk>[] = [];
        const newcomers: TOIMAnyEntitySlot<TPk>[] = [];
        for (const slot of slots) {
            if (addedPks.has(slot.pk)) newcomers.push(slot);
            else sorted.push(slot);
        }

        for (const slot of newcomers) {
            let low = 0;
            let high = sorted.length;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (this.compareSlots(sorted[mid], slot) <= 0) low = mid + 1;
                else high = mid;
            }
            sorted.splice(low, 0, slot);
        }
        return sorted;
    }

    /**
     * Order two slots. With `orderBy` the sort value is read from the cache kept
     * on every write, so a comparison costs a Map lookup rather than two calls
     * into user code.
     */
    private compareSlots(
        a: TOIMAnyEntitySlot<TPk>,
        b: TOIMAnyEntitySlot<TPk>
    ): number {
        const aItem = a.item as TEntity | undefined;
        const bItem = b.item as TEntity | undefined;
        if (aItem === undefined || bItem === undefined) return 0;
        if (this.compareEntities) return this.compareEntities(aItem, bItem);

        const cached = this.orderValueByPk;
        const aValue = cached.has(a.pk) ? cached.get(a.pk)! : this.orderBy!(aItem);
        const bValue = cached.has(b.pk) ? cached.get(b.pk)! : this.orderBy!(bItem);
        if (aValue < bValue) return -1;
        if (aValue > bValue) return 1;
        return 0;
    }

    private sortSlots(
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): TOIMAnyEntitySlot<TPk>[] {
        if (!this.compareEntities && !this.orderBy) return slots.slice();
        return slots.slice().sort((a, b) => this.compareSlots(a, b));
    }

    private normalizeKeys(
        keys: TKey | readonly TKey[] | undefined | null
    ): TKey[] {
        if (keys === undefined || keys === null) return [];
        const rawKeys = Array.isArray(keys) ? keys : [keys];
        const result: TKey[] = [];
        const seen = new Set<TKey>();
        for (const key of rawKeys) {
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(key);
        }
        return result;
    }
}
