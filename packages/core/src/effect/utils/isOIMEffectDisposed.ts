import type { TOIMEffect } from '../types/TOIMEffect';
import { OIM_EFFECT_FLAG_DISPOSED } from '../constants/OIM_EFFECT_FLAG_DISPOSED';

export function isOIMEffectDisposed(effect: TOIMEffect): boolean {
    return (effect.effectFlags & OIM_EFFECT_FLAG_DISPOSED) !== 0;
}
