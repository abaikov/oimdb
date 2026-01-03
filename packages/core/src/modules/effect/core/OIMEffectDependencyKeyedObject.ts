import { OIMReactiveObject } from '../../../core/OIMReactiveObject';
import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';
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
            object.updateEventEmitter,
            keyOrKeys
        );
    }

    public subscribe(
        phase: EOIMEffectPhase,
        onInvalidate: () => void
    ): () => void {
        return this.dep.subscribe(phase, onInvalidate);
    }
}
