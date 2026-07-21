import { OIMReactiveObject } from '../../../core/OIMReactiveObject';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';

export class OIMEffectDependencyKeyedObject<TKey extends string, TValue>
    implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TKey>;

    constructor(object: OIMReactiveObject<TKey, TValue>, key: TKey) {
        this.dep = new OIMEffectDependencyKeyed<TKey>(object, key);
    }

    public get source(): OIMReactiveObject<TKey, TValue> {
        return this.dep.source as OIMReactiveObject<TKey, TValue>;
    }

    public subscribe(
        onUpdate: () => void
    ): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
