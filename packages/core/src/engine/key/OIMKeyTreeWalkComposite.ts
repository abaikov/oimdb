import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import { OIMKeyTreeWalk } from './OIMKeyTreeWalk';
import { oimUnholdSlotIfAlive } from '../slot/utils/oimUnholdSlotIfAlive';

export class OIMKeyTreeWalkComposite extends OIMKeyTreeWalk<TOIMEntitySlot> {
    public static readonly INSTANCE = new OIMKeyTreeWalkComposite();

    protected holdCompositeKeyPart(entitySlot: TOIMEntitySlot): void {
        entitySlot.owner.holdSlot(entitySlot);
    }

    protected unholdCompositeKeyPart(entitySlot: TOIMEntitySlot): void {
        oimUnholdSlotIfAlive(entitySlot);
    }
}
