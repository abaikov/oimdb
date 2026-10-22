import type { TOIMEffect } from '../types/TOIMEffect';
import { OIM_EFFECT_FLAG_DISPOSED } from '../constants/OIM_EFFECT_FLAG_DISPOSED';

export function oimIsEffectDisposed(effect: TOIMEffect): boolean {
    return (effect.effectFlags & OIM_EFFECT_FLAG_DISPOSED) !== 0;
}
