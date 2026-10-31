import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';
import type { OIMEntitySlot } from './OIMEntitySlot';

export class OIMSlotEntityPresenceEmptinessPolicy implements IOIMSlotEmptinessPolicy<TOIMEntityContentSlot> {
    public static readonly INSTANCE = new OIMSlotEntityPresenceEmptinessPolicy();

    public isEmpty(entitySlot: TOIMEntityContentSlot): boolean {
        return (entitySlot as unknown as OIMEntitySlot).content === undefined;
    }
}
