import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';

export type TOIMEffectOptions = {
    deps?: readonly IOIMEffectDependency[];
    onUpdate?: () => void;
    run: () => void;
};


