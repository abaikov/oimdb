import { TOIMKey } from '../../../types/TOIMKey';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';
import { IOIMKeyedSubscription } from '../../../interfaces/IOIMKeyedSubscription';

export class OIMEffectDependencyKeyedIndex<TKey extends TOIMKey>
    implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TKey>;

    constructor(index: IOIMKeyedSubscription<TKey>, key: TKey) {
        this.dep = new OIMEffectDependencyKeyed<TKey>(index, key);
    }

    public get source(): IOIMKeyedSubscription<TKey> {
        return this.dep.source;
    }

    public subscribe(onUpdate: () => void): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
