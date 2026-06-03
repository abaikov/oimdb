import { OIMReactiveObject } from '../../../core/OIMReactiveObject';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import { OIMComputeRuntime } from '../../compute/core/OIMComputeRuntime';

export class OIMObjectValueByKeySelector<
    TKey extends string,
    TValue,
> extends OIMSelector<TValue | undefined> {
    constructor(
        runtime: OIMComputeRuntime,
        private readonly obj: OIMReactiveObject<TKey, TValue>,
        private readonly key: TKey
    ) {
        super(runtime, [
            new OIMSelectorSourceDependencyUpdateEventEmitterKey<TKey>(
                obj,
                key
            ),
        ]);
    }

    public getValue(): TValue | undefined {
        return this.obj.get(this.key);
    }
}
