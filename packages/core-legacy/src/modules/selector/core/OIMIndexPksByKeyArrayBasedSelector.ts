import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import type { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMSelectorArrayValued } from './OIMSelectorArrayValued';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import type { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMIndexPksByKeyArrayBasedSelector<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMSelectorArrayValued<TPk> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly reactiveIndex: OIMReactiveIndexArrayBased<
            TKey,
            TPk,
            TIndex
        >,
        private readonly key: TKey
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKey<TKey>(
                reactiveIndex.emitter,
                key
            ),
        ]);
    }

    public getValue(): readonly TPk[] {
        return this.reactiveIndex.getPksByKey(this.key);
    }
}
