import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMSelectorArrayValued } from './OIMSelectorArrayValued';
import { OIMSelectorSourceDependencyUpdateEventEmitterKeys } from './OIMSelectorSourceDependencyUpdateEventEmitterKeys';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMIndexPksByKeysArrayBasedSelector<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMSelectorArrayValued<TPk> {
    private readonly keys: readonly TKey[];

    constructor(
        runtime: OIMComputeRuntime,
        private readonly reactiveIndex: OIMReactiveIndexArrayBased<
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
        // `keys.map(...).flat()` allocated the per-key arrays plus a `map`
        // result plus a `flat` result; concatenating in place drops the last
        // two. The per-key arrays stay: an ordered index hands back a defensive
        // copy of its bucket, which is the point of it being ordered.
        const pks: TPk[] = [];
        for (const key of this.keys) {
            const keyPks = this.reactiveIndex.getPksByKey(key);
            for (let i = 0; i < keyPks.length; i++) pks.push(keyPks[i]);
        }
        return pks;
    }
}
