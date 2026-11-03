import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import { OIMKeyTreeWalk } from './OIMKeyTreeWalk';
import { unholdOIMSlotIfAlive } from '../slot/utils/unholdOIMSlotIfAlive';

export class OIMCompositeKeyTreeWalk extends OIMKeyTreeWalk<TOIMEntitySlot> {
    public static readonly INSTANCE = new OIMCompositeKeyTreeWalk();

    protected holdCompositeKeyPart(entitySlot: TOIMEntitySlot): void {
        entitySlot.owner.holdSlot(entitySlot);
    }

    protected unholdCompositeKeyPart(entitySlot: TOIMEntitySlot): void {
        unholdOIMSlotIfAlive(entitySlot);
    }
}
