import { OIMReactiveObject } from '../../../core/OIMReactiveObject';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKeys } from './OIMSelectorSourceDependencyUpdateEventEmitterKeys';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

export class OIMObjectValuesByKeysSelector<
    TKey extends string,
    TValue,
> extends OIMSelector<readonly (TValue | undefined)[]> {
    private readonly keys: readonly TKey[];

    constructor(
        runtime: OIMComputativeRuntime,
        private readonly obj: OIMReactiveObject<TKey, TValue>,
        keys: readonly TKey[]
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKeys<TKey>(
                obj,
                keys
            ),
        ]);
        this.keys = keys;
    }

    public getValue(): readonly (TValue | undefined)[] {
        return this.keys.map(k => this.obj.get(k));
    }

    protected areEqual(
        prev: readonly (TValue | undefined)[],
        next: readonly (TValue | undefined)[]
    ): boolean {
        if (prev === next) return true;
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++) {
            if (prev[i] !== next[i]) return false;
        }
        return true;
    }
}
