import { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import { TOIMPk } from '../../../type/TOIMPk';
import { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

export class OIMIndexPksByKeySetBasedSelector<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelector<Set<TPk>> {
    constructor(
        runtime: OIMComputativeRuntime,
        private readonly reactiveIndex: OIMReactiveIndexSetBased<
            TKey,
            TPk,
            TIndex
        >,
        private readonly key: TKey
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKey<TKey>(
                reactiveIndex,
                key
            ),
        ]);
    }

    public getValue(): Set<TPk> {
        return this.reactiveIndex.getPksByKey(this.key);
    }
}
