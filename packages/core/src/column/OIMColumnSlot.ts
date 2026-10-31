import { OIMSlot } from '../slot/OIMSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMSlot } from '../slot/types/TOIMSlot';

export class OIMColumnSlot extends OIMSlot {
    public key: string;

    public carrierSlot: TOIMSlot;

    public constructor(key: string, owner: IOIMSlotOwner, carrierSlot: TOIMSlot) {
        super(owner, carrierSlot.storeSlot);
        this.changedAtRevision = carrierSlot.changedAtRevision;
        this.changedAtEpoch = carrierSlot.changedAtEpoch;
        this.key = key;
        this.carrierSlot = carrierSlot;
    }
}
