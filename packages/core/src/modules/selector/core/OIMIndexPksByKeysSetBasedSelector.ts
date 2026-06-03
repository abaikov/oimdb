import { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKeys } from './OIMSelectorSourceDependencyUpdateEventEmitterKeys';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMIndexPksByKeysSetBasedSelector<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelector<readonly TPk[]> {
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
                reactiveIndex,
                keys
            ),
        ]);
        this.keys = keys;
    }

    public getValue(): readonly TPk[] {
        return this.keys
            .map(key => Array.from(this.reactiveIndex.getPksByKey(key)))
            .flat();
    }

    protected areEqual(prev: readonly TPk[], next: readonly TPk[]): boolean {
        if (prev === next) return true;
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++)
            if (prev[i] !== next[i]) return false;
        return true;
    }
}
