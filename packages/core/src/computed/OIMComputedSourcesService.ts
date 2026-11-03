import type { TOIMComputedDerivation } from './types/TOIMComputedDerivation';
import { holdOIMSlots } from '../slot/utils/holdOIMSlots';
import { unholdOIMSlotIfAlive } from '../slot/utils/unholdOIMSlotIfAlive';

export class OIMComputedSourcesService {
    public static readonly INSTANCE = new OIMComputedSourcesService();

    public holdSources(derivation: TOIMComputedDerivation): void {
        holdOIMSlots(derivation.sourceSlots);
        holdOIMSlots(derivation.sourceComputeds);
    }

    public unholdSources(derivation: TOIMComputedDerivation): void {
        const sourceSlots = derivation.sourceSlots;
        for (let i = 0; i < sourceSlots.length; i++) unholdOIMSlotIfAlive(sourceSlots[i]);
        const sourceComputeds = derivation.sourceComputeds;
        for (let i = 0; i < sourceComputeds.length; i++) unholdOIMSlotIfAlive(sourceComputeds[i]);
    }
}
