import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { OIMReactiveGlobalIndexArrayBased } from '../../../abstract/OIMReactiveGlobalIndexArrayBased';
import { OIMGlobalIndexArrayBased } from '../../../abstract/OIMGlobalIndexArrayBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { IOIMSelectorSourceDependency } from '../interfaces/IOIMSelectorSourceDependency';

export class OIMSelectorSourceDependencyEntitiesByGlobalIndexArrayBased<
    TEntity extends object,
    TPk extends TOIMPk,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
> implements IOIMSelectorSourceDependency
{
    private unsubscribeFromCollectionKeys?: () => void;
    private currentPks: readonly TPk[] = [];

    constructor(
        private readonly collection: OIMReactiveCollection<TEntity, TPk>,
        private readonly reactiveIndex: OIMReactiveGlobalIndexArrayBased<
            TPk,
            TIndex
        >
    ) {}

    public subscribe(onUpdate: () => void): () => void {
        const resubscribeCollection = () => {
            const nextPks = this.reactiveIndex.getPks();
            if (this.sameArray(this.currentPks, nextPks)) return;

            this.unsubscribeFromCollectionKeys?.();
            this.unsubscribeFromCollectionKeys = undefined;
            this.currentPks = nextPks;

            if (this.currentPks.length === 0) return;
            this.unsubscribeFromCollectionKeys =
                this.collection.subscribeOnKeys(this.currentPks, onUpdate);
        };

        const onIndexUpdate = () => {
            resubscribeCollection();
            onUpdate();
        };

        // initial subscription to collection keys
        resubscribeCollection();

        const unsubscribeFromIndex = this.reactiveIndex.subscribe(onIndexUpdate);

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
