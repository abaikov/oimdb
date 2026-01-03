import { IOIMEffectDependency } from '../../effect/interfaces/IOIMEffectDependency';

export type TOIMComputedOptions<TValue> = {
    compute: () => TValue;
    deps?: readonly IOIMEffectDependency[];
    compare?: (a: TValue, b: TValue) => boolean;
};
