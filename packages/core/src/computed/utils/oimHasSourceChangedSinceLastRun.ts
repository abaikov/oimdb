import type { TOIMComputedDerivation } from '../types/TOIMComputedDerivation';
import { oimIsAnySlotChangedAfter } from '../../channel/utils/oimIsAnySlotChangedAfter';

export function oimHasSourceChangedSinceLastRun(derivation: TOIMComputedDerivation): boolean {
    return oimIsAnySlotChangedAfter(derivation.sourceComputeds, derivation.ranAtRevision, derivation.ranAtEpoch)
        || oimIsAnySlotChangedAfter(derivation.sourceSlots, derivation.ranAtRevision, derivation.ranAtEpoch);
}
