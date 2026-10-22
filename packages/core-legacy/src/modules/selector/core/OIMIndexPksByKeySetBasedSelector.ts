import type { TOIMKey } from '../../../types/TOIMKey';
import type { OIMReactiveIndexSetBased } from '../../../abstract/OIMReactiveIndexSetBased';
import type { OIMIndexSetBased } from '../../../abstract/OIMIndexSetBased';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import type { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMIndexPksByKeySetBasedSelector<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMSelector<Set<TPk>> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly reactiveIndex: OIMReactiveIndexSetBased<
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

    public getValue(): Set<TPk> {
        return this.reactiveIndex.getPksByKey(this.key);
    }

    /**
     * Compare MEMBERSHIP, not identity.
     *
     * `getValue` builds a fresh `Set` on every read, so the inherited
     * `Object.is` could never report two reads as equal — this selector woke
     * every watcher on every flush that touched the key, even when the pks were
     * unchanged. Its array-based sibling has always compared contents; this is
     * the same guarantee, expressed for a set (order carries no meaning here, so
     * equal size plus containment is equality).
     */
    protected areEqual(prev: Set<TPk>, next: Set<TPk>): boolean {
        if (prev === next) return true;
        if (prev.size !== next.size) return false;
        for (const pk of next) {
            if (!prev.has(pk)) return false;
        }
        return true;
    }
}
