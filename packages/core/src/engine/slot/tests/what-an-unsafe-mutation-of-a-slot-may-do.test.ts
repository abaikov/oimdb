import { OIMDB } from '../../../factories/OIMDB';
import { OIMSlotOwner } from '../OIMSlotOwner';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMSlotEditable } from '../types/TOIMSlotEditable';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TRow = { id: string };

const LIBRARY_SLOT_FLAG = 32;

describe('what an unsafe mutation of a slot may do', () => {
    it('runs the mutation on the slot itself, so a library can set a bit of its own', () => {
        const db = new OIMDB();
        const rowsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TRow, string>(db) });
        const slot = rowsService.writeSlotContentByKey(rowsService.createStoreSlot(db), 'r', { id: 'r' });

        slot.owner.unsafeMutateSlot(slot, slotEditable => { slotEditable.slotFlags |= LIBRARY_SLOT_FLAG; });

        expect(slot.slotFlags & LIBRARY_SLOT_FLAG).toBe(LIBRARY_SLOT_FLAG);
    });

    it('goes through the owner, so a subclass can hook every unsafe mutation', () => {
        const mutatedSlots: TOIMSlot[] = [];
        class OIMSlotOwnerThatSeesUnsafeMutations extends OIMSlotOwner {
            public override unsafeMutateSlot(slot: TOIMSlot, mutateSlot: (slotEditable: TOIMSlotEditable<TOIMSlot>) => void): void {
                mutatedSlots.push(slot);
                super.unsafeMutateSlot(slot, mutateSlot);
            }
        }
        const owner = new OIMSlotOwnerThatSeesUnsafeMutations();
        const slot = { slotFlags: 0 } as TOIMSlot;

        owner.unsafeMutateSlot(slot, slotEditable => { slotEditable.slotFlags |= LIBRARY_SLOT_FLAG; });

        expect(mutatedSlots).toEqual([slot]);
        expect(slot.slotFlags).toBe(LIBRARY_SLOT_FLAG);
    });
});
