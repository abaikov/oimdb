import type { TOIMComputedDerivation } from '../types/TOIMComputedDerivation';
import { isOIMAnySlotChangedAfter } from '../../channel/utils/isOIMAnySlotChangedAfter';

export function hasOIMSourceChangedSinceLastRun(derivation: TOIMComputedDerivation): boolean {
    return isOIMAnySlotChangedAfter(derivation.sourceComputeds, derivation.ranAtRevision, derivation.ranAtEpoch)
        || isOIMAnySlotChangedAfter(derivation.sourceSlots, derivation.ranAtRevision, derivation.ranAtEpoch);
}
