import { OIMSlotOwner } from '../../src/slot/OIMSlotOwner';

export class TestSlotOwner extends OIMSlotOwner {
    public releaseSlotIfUnheld(): void { return; }
}
