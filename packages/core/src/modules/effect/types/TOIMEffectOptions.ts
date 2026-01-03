import { IOIMEffectDependency } from '../interfaces/IOIMEffectDependency';
import { EOIMEffectPhase } from '../enum/EOIMEffectPhase';

export type TOIMEffectOptions = {
    deps?: readonly IOIMEffectDependency[];
    phase: EOIMEffectPhase;
    onInvalidate?: () => void;
    run: () => void;
};


