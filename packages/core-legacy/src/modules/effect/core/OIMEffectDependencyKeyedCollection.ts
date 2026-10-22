import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveCollection } from '../../../core/OIMReactiveCollection';
import type { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';

export class OIMEffectDependencyKeyedCollection<
    TEntity extends object,
    TPk extends TOIMKey,
> implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TPk>;

    constructor(collection: OIMReactiveCollection<TEntity, TPk>, pk: TPk) {
        this.dep = new OIMEffectDependencyKeyed<TPk>(collection.emitter, pk);
    }


    public subscribe(onUpdate: () => void): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
