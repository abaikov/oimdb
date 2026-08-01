import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { IOIMSelectorSourceDependency } from '../interfaces/IOIMSelectorSourceDependency';

/**
 * Keeps a selector woken by BOTH halves of an "entities of an index" read: the
 * index's own membership, and the entities currently in it.
 *
 * The index tells us WHICH pks; the collection tells us when one of those pks
 * changes. So every membership change has to re-point the collection
 * subscription at the new pk set — that dance (compare, drop, re-subscribe,
 * skip when empty) is identical for every index flavour and lived in four
 * copies before this class.
 *
 * What genuinely differs is only how a flavour reads its pks and how it
 * subscribes, so those are the two abstract members below. Each concrete
 * subclass answers them for exactly one index shape — no branch here ever asks
 * what it was handed.
 */
export abstract class OIMSelectorSourceDependencyEntitiesByPks<
    TEntity extends object,
    TPk extends TOIMKey,
> implements IOIMSelectorSourceDependency
{
    private unsubscribeFromCollectionKeys?: () => void;
    private currentPks: readonly TPk[] = [];

    constructor(
        protected readonly collection: OIMReactiveCollection<TEntity, TPk>
    ) {}

    /** The pks this dependency currently covers, as a positional array. */
    protected abstract readPks(): readonly TPk[];

    /** Subscribe to the index this dependency watches. Returns unsubscribe. */
    protected abstract subscribeToIndex(onUpdate: () => void): () => void;

    public subscribe(onUpdate: () => void): () => void {
        const resubscribeCollection = () => {
            const nextPks = this.readPks();
            if (this.sameArray(this.currentPks, nextPks)) return;

            this.unsubscribeFromCollectionKeys?.();
            this.unsubscribeFromCollectionKeys = undefined;
            this.currentPks = nextPks;

            if (this.currentPks.length === 0) return;
            this.unsubscribeFromCollectionKeys =
                this.collection.emitter.subscribeOnKeys(this.currentPks, onUpdate);
        };

        const onIndexUpdate = () => {
            resubscribeCollection();
            onUpdate();
        };

        // initial subscription to collection keys
        resubscribeCollection();

        const unsubscribeFromIndex = this.subscribeToIndex(onIndexUpdate);

        return () => {
            unsubscribeFromIndex();
            this.unsubscribeFromCollectionKeys?.();
            this.unsubscribeFromCollectionKeys = undefined;
            this.currentPks = [];
        };
    }

    private sameArray(a: readonly TPk[], b: readonly TPk[]): boolean {
        if (a === b) return true;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
    }
}
