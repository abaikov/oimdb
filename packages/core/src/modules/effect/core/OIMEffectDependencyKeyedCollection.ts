import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { TOIMPk } from '../../../type/TOIMPk';
import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';

export class OIMEffectDependencyKeyedCollection<
    TEntity extends object,
    TPk extends TOIMPk,
> implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TPk>;

    constructor(collection: OIMReactiveCollection<TEntity, TPk>, pk: TPk);
    constructor(
        collection: OIMReactiveCollection<TEntity, TPk>,
        pks: readonly TPk[]
    );
    constructor(
        collection: OIMReactiveCollection<TEntity, TPk>,
        pkOrPks: TPk | readonly TPk[]
    ) {
        this.dep = new OIMEffectDependencyKeyed<TPk>(
            collection.updateEventEmitter,
            pkOrPks
        );
    }

    public subscribe(
        phase: EOIMEffectPhase,
        onInvalidate: () => void
    ): () => void {
        return this.dep.subscribe(phase, onInvalidate);
    }
}
