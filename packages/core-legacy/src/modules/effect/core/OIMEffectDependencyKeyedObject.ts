import type { OIMReactiveObject } from '../../../core/OIMReactiveObject';
import type { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';

export class OIMEffectDependencyKeyedObject<TKey extends string, TValue>
    implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TKey>;

    constructor(object: OIMReactiveObject<TKey, TValue>, key: TKey) {
        this.dep = new OIMEffectDependencyKeyed<TKey>(object.emitter, key);
    }


    public subscribe(
        onUpdate: () => void
    ): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
