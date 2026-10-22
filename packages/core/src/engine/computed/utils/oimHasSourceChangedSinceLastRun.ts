import type { TOIMDerivation } from '../types/TOIMDerivation';
import { oimIsAnySlotChangedAfter } from '../../channel/utils/oimIsAnySlotChangedAfter';

export function oimHasSourceChangedSinceLastRun(derivation: TOIMDerivation): boolean {
    return oimIsAnySlotChangedAfter(derivation.sourceComputeds, derivation.ranAtRevision, derivation.ranAtEpoch)
        || oimIsAnySlotChangedAfter(derivation.sourceSlots, derivation.ranAtRevision, derivation.ranAtEpoch);
}
