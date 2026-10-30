import type { TOIMEffect } from '../types/TOIMEffect';
import { OIM_EFFECT_FLAG_RUN_SCHEDULED } from '../constants/OIM_EFFECT_FLAG_RUN_SCHEDULED';

export function oimIsEffectRunScheduled(effect: TOIMEffect): boolean {
    return (effect.effectFlags & OIM_EFFECT_FLAG_RUN_SCHEDULED) !== 0;
}
