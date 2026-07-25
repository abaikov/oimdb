import { TOIMKey } from '../types/TOIMKey';
import { OIMEventQueue } from './OIMEventQueue';
import { OIMReactiveCollection } from './OIMReactiveCollection';
import { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import { EOIMCollectionEventType } from '../enums/EOIMCollectionEventType';

export type TOIMDerivedCollectionOptions<
    TDerived extends object,
    TPk extends TOIMKey,
> = {
    /**
     * Skip a downstream update when a source change leaves the re-derived entity
     * equal. Default `Object.is` (a fresh object each derive → always different,
     * so it propagates every source change; pass a shallow/field compare to
     * memoize finer).
     */
    compare?: (a: TDerived, b: TDerived) => boolean;
    /** Custom store — pass a trie-driven store when the source PK is composite. */
    store?: OIMCollectionStore<TDerived, TPk>;
    /** Build from the source's current contents at construction (default true). */
    buildInitial?: boolean;
};

/**
 * A reactive collection whose entities are derived one-to-one from a source
 * collection: `derived[pk] = derive(source[pk])`, keyed by the SOURCE pk. It
 * listens to the source and keeps itself in sync — add / update / remove.
 *
 * It is a first-class `OIMReactiveCollection`, so it can be indexed, selected,
 * and derived-from again (join → join). Maintenance runs on the source's
 * synchronous UPDATE channel, so a chain of derivations stays consistent within
 * the same flush; delivery to keyed subscribers is batched on flush as usual.
 *
 * Parallels `OIMDerivedCollectionIndex*`: the source stays the single source of
 * truth, and this needs no compute runtime — it is driven purely by the source's
 * update events.
 */
export class OIMDerivedCollection<
    TSource extends object,
    TDerived extends object,
    TPk extends TOIMKey,
> extends OIMReactiveCollection<TDerived, TPk> {
    private readonly source: OIMReactiveCollection<TSource, TPk>;
    private readonly derive: (entity: TSource, pk: TPk) => TDerived;
    private readonly compareDerived: (a: TDerived, b: TDerived) => boolean;
    private readonly unsubscribeFromSource: () => void;

    constructor(
        queue: OIMEventQueue,
        source: OIMReactiveCollection<TSource, TPk>,
        derive: (entity: TSource, pk: TPk) => TDerived,
        opts?: TOIMDerivedCollectionOptions<TDerived, TPk>
    ) {
        super(queue, {
            store: opts?.store,
            // Each sync recomputes the WHOLE derived entity → replace, not merge.
            updateEntity: draft => draft as TDerived,
        });
        this.source = source;
        this.derive = derive;
        this.compareDerived = opts?.compare ?? Object.is;
        this.unsubscribeFromSource = source.emitter.on(
            EOIMCollectionEventType.UPDATE,
            payload => this.onSourceUpdate(payload.pks)
        );

        if (opts?.buildInitial !== false) {
            this.rebuildFromSource();
        }
    }

    public rebuildFromSource(): void {
        // Drop derived entries whose source is gone, then (re)derive the rest.
        for (const pk of this.getAllPks()) {
            if (this.source.getOneByPk(pk) === undefined) {
                this.removeOneByPk(pk);
            }
        }
        for (const slot of this.source.getAllSlots()) {
            if (slot.item !== undefined) this.syncPk(slot.pk);
        }
    }

    public override destroy(): void {
        this.unsubscribeFromSource();
        super.destroy();
    }

    private readonly onSourceUpdate = (pks: readonly TPk[]): void => {
        // `pks` always enumerates exactly the changed keys (clear() lists every
        // removed key), so removals flow through the normal per-key path below.
        for (let i = 0; i < pks.length; i++) this.syncPk(pks[i]);
    };

    private syncPk(pk: TPk): void {
        const sourceEntity = this.source.getOneByPk(pk);
        if (sourceEntity === undefined) {
            if (this.getOneByPk(pk) !== undefined) this.removeOneByPk(pk);
            return;
        }
        const next = this.derive(sourceEntity, pk);
        const prev = this.getOneByPk(pk);
        // Memoize: a source change that leaves the derived value equal is not
        // propagated downstream.
        if (prev !== undefined && this.compareDerived(prev, next)) return;
        this.upsertOneByPk(pk, next);
    }
}
