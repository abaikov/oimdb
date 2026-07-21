import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';

export class OIMEffectDependencyKeyedCollection<
    TEntity extends object,
    TPk extends TOIMKey,
> implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TPk>;

    constructor(collection: OIMReactiveCollection<TEntity, TPk>, pk: TPk) {
        this.dep = new OIMEffectDependencyKeyed<TPk>(collection, pk);
    }

    public get source(): OIMReactiveCollection<TEntity, TPk> {
        return this.dep.source as OIMReactiveCollection<TEntity, TPk>;
    }

    public subscribe(onUpdate: () => void): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
