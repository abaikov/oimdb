import { OIMReactiveObject } from '../../../core/OIMReactiveObject';
import { OIMSelector } from './OIMSelector';
import { OIMSelectorSourceDependencyUpdateEventEmitterKey } from './OIMSelectorSourceDependencyUpdateEventEmitterKey';
import { OIMComputativeRuntime } from '../../computative/core/OIMComputativeRuntime';

export class OIMObjectValueByKeySelector<
    TKey extends string,
    TValue,
> extends OIMSelector<TValue | undefined> {
    constructor(
        runtime: OIMComputativeRuntime,
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
