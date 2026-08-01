import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelectorArrayValued } from './OIMSelectorArrayValued';
import { OIMSelectorSourceDependencyUpdateEventEmitterKeys } from './OIMSelectorSourceDependencyUpdateEventEmitterKeys';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMIndexPksByKeysSetBasedSelector<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelectorArrayValued<TPk> {
    private readonly keys: readonly TKey[];

    constructor(
        runtime: OIMComputeRuntime,
        private readonly reactiveIndex: OIMReactiveIndexSetBased<
            TKey,
            TPk,
            TIndex
        >,
        keys: readonly TKey[]
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKeys<TKey>(
                reactiveIndex.emitter,
                keys
            ),
        ]);
        this.keys = keys;
    }

    public getValue(): readonly TPk[] {
        // One array, filled straight from the live buckets. The previous
        // `keys.map(key => Array.from(getPksByKey(key))).flat()` allocated
        // 2K+2 arrays/sets for K keys: a throwaway `Set<TPk>` per key, an array
        // per key, the `map` result and the `flat` result.
        const pks: TPk[] = [];
        for (const key of this.keys) {
            for (const slot of this.reactiveIndex.getSlotsByKey(key)) {
                pks.push(slot.pk);
            }
        }
        return pks;
    }
}
