import { OIMReactiveObject } from '../../../core/OIMReactiveObject';
import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { OIMEffectDependencyKeyed } from './OIMEffectDependencyKeyed';

export class OIMEffectDependencyKeyedObject<TKey extends string, TValue>
    implements IOIMEffectDependency
{
    private readonly dep: OIMEffectDependencyKeyed<TKey>;

    constructor(object: OIMReactiveObject<TKey, TValue>, key: TKey);
    constructor(object: OIMReactiveObject<TKey, TValue>, keys: readonly TKey[]);
    constructor(
        object: OIMReactiveObject<TKey, TValue>,
        keyOrKeys: TKey | readonly TKey[]
    ) {
        this.dep = new OIMEffectDependencyKeyed<TKey>(
            object,
            keyOrKeys
        );
    }

    public subscribe(
        onUpdate: () => void
    ): () => void {
        return this.dep.subscribe(onUpdate);
    }
}
