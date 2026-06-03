import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMIndexPksByKeyArrayBasedSelector<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMSelector<readonly TPk[]> {
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
                reactiveIndex,
                key
            ),
        ]);
    }

    public getValue(): readonly TPk[] {
        return this.reactiveIndex.getPksByKey(this.key);
    }

    protected areEqual(prev: readonly TPk[], next: readonly TPk[]): boolean {
        if (prev === next) return true;
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++)
            if (prev[i] !== next[i]) return false;
        return true;
    }
}
