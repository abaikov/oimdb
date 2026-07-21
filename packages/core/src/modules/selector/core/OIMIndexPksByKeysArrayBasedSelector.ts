import { TOIMKey } from '../../../types/TOIMKey';
import { OIMReactiveIndexArrayBased } from '../../../abstract/OIMReactiveIndexArrayBased';
import { TOIMPk } from '../../../types/TOIMPk';
import { OIMIndexArrayBased } from '../../../abstract/OIMIndexArrayBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKeys } from './OIMSelectorSourceDependencyUpdateEventEmitterKeys';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMIndexPksByKeysArrayBasedSelector<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMSelector<readonly TPk[]> {
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
                reactiveIndex,
                keys
            ),
        ]);
        this.keys = keys;
    }

    public getValue(): readonly TPk[] {
        return this.keys.map(key => this.reactiveIndex.getPksByKey(key)).flat();
    }

    protected areEqual(prev: readonly TPk[], next: readonly TPk[]): boolean {
        if (prev === next) return true;
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++)
            if (prev[i] !== next[i]) return false;
        return true;
    }
}
