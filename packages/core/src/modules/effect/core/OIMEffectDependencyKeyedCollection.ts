import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { TOIMPk } from '../../../types/TOIMPk';
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
            collection,
            pkOrPks
        );
    }

    public get source(): OIMReactiveCollection<TEntity, TPk> {
        return this.dep.source as OIMReactiveCollection<TEntity, TPk>;
    }

    public subscribe(
        onUpdate: () => void
    ): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
