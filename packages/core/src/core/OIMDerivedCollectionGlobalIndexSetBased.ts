import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';
import {
    TOIMDerivedCollectionGlobalIndexSetBasedOptions,
    TOIMGlobalIndexFilter,
} from '../types/TOIMCollectionGlobalIndexOptions';
import { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { TOIMPk } from '../types/TOIMPk';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMReactiveCollectionGlobalIndexManualSetBased } from './OIMReactiveCollectionGlobalIndexManualSetBased';

/**
 * Keyless set-based index derived from the whole collection.
 *
 * Auto-maintains a single unordered set of every entity that passes `filter`
 * (default: "entity exists"). Mirrors {@link OIMDerivedCollectionIndexSetBased}
 * minus the key.
 */
export class OIMDerivedCollectionGlobalIndexSetBased<
    TPk extends TOIMPk,
    TEntity extends object = object,
> extends OIMReactiveCollectionGlobalIndexManualSetBased<TPk, TEntity> {
    private readonly collection: OIMReactiveCollection<TEntity, TPk>;
    private readonly filter?: TOIMGlobalIndexFilter<TEntity>;
    private readonly unsubscribeFromCollection: () => void;
    private readonly presentPks = new Set<TPk>();

    constructor(
        queue: OIMEventQueue,
        collection: OIMReactiveCollection<TEntity, TPk>,
        opts: TOIMDerivedCollectionGlobalIndexSetBasedOptions<TEntity, TPk>
    ) {
        super(queue, { collection, indexOptions: opts.indexOptions });
        this.collection = collection;
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
        super.clear();

        const slots = new Set<TOIMEntitySlot<TEntity, TPk>>();
        for (const slot of this.collection.getAllSlots()) {
            if (slot.item === undefined) continue;
            if (this.filter && !this.filter(slot.item)) continue;
            this.presentPks.add(slot.pk);
            slots.add(slot);
        }

        super.setSlots(slots);
    }

    public override clear(): void {
        this.presentPks.clear();
        super.clear();
    }

    public override destroy(): void {
        this.unsubscribeFromCollection();
        this.presentPks.clear();
        super.destroy();
    }

    private readonly onCollectionUpdate = (pks: readonly TPk[]): void => {
        if (pks.length === 0) {
            this.rebuildFromCollection();
            return;
        }

        for (const pk of pks) {
            const prev = this.presentPks.has(pk);
            const slot = this.collection.getSlotByPk(pk);
            const entity = slot?.item;
            const next =
                entity !== undefined && (!this.filter || this.filter(entity));

            if (prev && !next) {
                super.removePks([pk]);
                this.presentPks.delete(pk);
            } else if (!prev && next) {
                super.addPks([pk]);
                this.presentPks.add(pk);
            }
        }
    };
}
