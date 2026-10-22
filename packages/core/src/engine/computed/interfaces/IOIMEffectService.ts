import type { TOIMEffect } from '../types/TOIMEffect';

export interface IOIMEffectService {
    markEffectRunScheduled(effect: TOIMEffect, isSourceCheckOwed: boolean): boolean;
    runScheduledEffect(effect: TOIMEffect): void;
    runEffect(effect: TOIMEffect): void;
    runEffectIfSourcesChanged(effect: TOIMEffect): void;
    setPositionInSubscribedSlot(effect: TOIMEffect, edge: number, positionInSlot: number): void;
}
