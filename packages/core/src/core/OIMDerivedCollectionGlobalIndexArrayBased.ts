import { TOIMKey } from '../types/TOIMKey';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import {
    TOIMDerivedEntityComparator,
    TOIMDerivedEntityOrderSelector,
    TOIMDerivedEntityOrderValue,
} from '../types/TOIMCollectionIndexOptions';
import {
    TOIMDerivedCollectionGlobalIndexArrayBasedOptions,
    TOIMGlobalIndexFilter,
} from '../types/TOIMCollectionGlobalIndexOptions';
import { TOIMAnyEntitySlot, TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMReactiveCollectionGlobalIndexManualArrayBased } from './OIMReactiveCollectionGlobalIndexManualArrayBased';

/**
 * Keyless array-based index derived from the whole collection.
 *
 * Auto-maintains a single ordered list of every entity that passes `filter`
 * (default: "entity exists"), sorted by `orderBy`/`compareEntities`. Mirrors
 * {@link OIMDerivedCollectionIndexArrayBased}, but membership is a single
 * boolean set (`presentPks`) instead of a per-pk key-set.
 */
export class OIMDerivedCollectionGlobalIndexArrayBased<
    TPk extends TOIMKey,
    TEntity extends object = object,
> extends OIMReactiveCollectionGlobalIndexManualArrayBased<TPk, TEntity> {
    private readonly collection: OIMReactiveCollection<TEntity, TPk>;
    private readonly compareEntities?: TOIMDerivedEntityComparator<TEntity>;
    private readonly orderBy?: TOIMDerivedEntityOrderSelector<TEntity>;
    private readonly filter?: TOIMGlobalIndexFilter<TEntity>;
    private readonly unsubscribeFromCollection: () => void;
    private readonly presentPks = new Set<TPk>();
    // Last known sort value per pk (only with `orderBy`), so an update touching
    // an unrelated field can skip re-sorting when the value is unchanged.
    private readonly orderValueByPk = new Map<
        TPk,
        TOIMDerivedEntityOrderValue
    >();

    constructor(
        queue: OIMEventQueue,
        collection: OIMReactiveCollection<TEntity, TPk>,
        opts: TOIMDerivedCollectionGlobalIndexArrayBasedOptions<TEntity, TPk>
    ) {
        super(queue, { collection, indexOptions: opts.indexOptions });
        this.collection = collection;
        this.compareEntities = opts.compareEntities;
        this.orderBy = opts.orderBy;
        this.filter = opts.filter;
        this.unsubscribeFromCollection = collection.emitter.on(
            EOIMCollectionEventType.UPDATE,
            payload => this.onCollectionUpdate(payload.pks)
        );

        if (opts.buildInitial !== false) {
            this.rebuildFromCollection();
        }
    }

    public rebuildFromCollection(): void {
        this.presentPks.clear();
        this.orderValueByPk.clear();
        super.clear();

        const slots: TOIMEntitySlot<TEntity, TPk>[] = [];
        for (const slot of this.collection.getAllSlots()) {
            if (slot.item === undefined) continue;
            if (this.filter && !this.filter(slot.item)) continue;
            this.presentPks.add(slot.pk);
            if (this.orderBy) {
                this.orderValueByPk.set(slot.pk, this.orderBy(slot.item));
            }
            slots.push(slot);
        }

        super.setSlots(this.sortSlots(slots));
    }

    public override clear(): void {
        this.presentPks.clear();
        this.orderValueByPk.clear();
        super.clear();
    }

    public override destroy(): void {
        this.unsubscribeFromCollection();
        this.presentPks.clear();
        this.orderValueByPk.clear();
        super.destroy();
    }

    private readonly onCollectionUpdate = (pks: readonly TPk[]): void => {
        if (pks.length === 0) {
            this.rebuildFromCollection();
            return;
        }

        const ordered = !!(this.compareEntities || this.orderBy);
        let needsSort = false;

        for (const pk of pks) {
            const prev = this.presentPks.has(pk);
            const slot = this.collection.getSlotByPk(pk);
            const entity = slot?.item;
            const next =
                entity !== undefined && (!this.filter || this.filter(entity));

            let orderChanged = false;
            if (this.orderBy) {
                if (!next || entity === undefined) {
                    this.orderValueByPk.delete(pk);
                } else {
                    const value = this.orderBy(entity);
                    orderChanged =
                        !this.orderValueByPk.has(pk) ||
                        this.orderValueByPk.get(pk) !== value;
                    this.orderValueByPk.set(pk, value);
                }
            } else if (this.compareEntities && next) {
                // A custom comparator may depend on any field — be conservative.
                orderChanged = true;
            }

            if (prev && !next) {
                super.removePks([pk]);
                this.presentPks.delete(pk);
            } else if (!prev && next) {
                super.addPks([pk]);
                this.presentPks.add(pk);
                if (ordered) needsSort = true;
            } else if (prev && next && orderChanged) {
                needsSort = true;
            }
        }

        if (ordered && needsSort) {
            super.setSlots(this.sortSlots(this.index.getSlots()));
        }
    };

    private sortSlots(
        slots: readonly TOIMAnyEntitySlot<TPk>[]
    ): TOIMAnyEntitySlot<TPk>[] {
        if (!this.compareEntities && !this.orderBy) return slots.slice();

        return slots.slice().sort((a, b) => {
            const aItem = a.item as TEntity | undefined;
            const bItem = b.item as TEntity | undefined;
            if (aItem === undefined || bItem === undefined) return 0;
            if (this.compareEntities) {
                return this.compareEntities(aItem, bItem);
            }

            const aValue = this.orderBy!(aItem);
            const bValue = this.orderBy!(bItem);
            if (aValue < bValue) return -1;
            if (aValue > bValue) return 1;
            return 0;
        });
    }
}
