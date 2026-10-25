import type { IOIMSlotEmptinessPolicy } from '../slot/interfaces/IOIMSlotEmptinessPolicy';
import type { TOIMEntityContentSlot } from './types/TOIMEntityContentSlot';

export class OIMSlotEntityPresenceEmptinessPolicy implements IOIMSlotEmptinessPolicy<TOIMEntityContentSlot> {
    public static readonly INSTANCE = new OIMSlotEntityPresenceEmptinessPolicy();

    public isEmpty(entitySlot: TOIMEntityContentSlot): boolean {
        return entitySlot.entity === undefined;
    }
}
