import type { TOIMComputedDerivation } from './types/TOIMComputedDerivation';
import { oimHoldSlots } from '../slot/utils/oimHoldSlots';
import { oimUnholdSlotIfAlive } from '../slot/utils/oimUnholdSlotIfAlive';

export class OIMComputedSourcesService {
    public static readonly INSTANCE = new OIMComputedSourcesService();

    public holdSources(derivation: TOIMComputedDerivation): void {
        oimHoldSlots(derivation.sourceSlots);
        oimHoldSlots(derivation.sourceComputeds);
    }

    public unholdSources(derivation: TOIMComputedDerivation): void {
        const sourceSlots = derivation.sourceSlots;
        for (let i = 0; i < sourceSlots.length; i++) oimUnholdSlotIfAlive(sourceSlots[i]);
        const sourceComputeds = derivation.sourceComputeds;
        for (let i = 0; i < sourceComputeds.length; i++) oimUnholdSlotIfAlive(sourceComputeds[i]);
    }
}
