import type { IOIMSlotEmptiness } from '../slot/interfaces/IOIMSlotEmptiness';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';

export class OIMSlotEmptinessByEntityPresence implements IOIMSlotEmptiness<TOIMEntitySlot> {
    public static readonly INSTANCE = new OIMSlotEmptinessByEntityPresence();

    public isEmpty(entitySlot: TOIMEntitySlot): boolean {
        return entitySlot.entity === undefined;
    }
}
