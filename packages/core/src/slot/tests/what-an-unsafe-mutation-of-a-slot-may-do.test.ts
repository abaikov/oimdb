import { OIMDB } from '../../db/OIMDB';
import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEditable } from '../types/TOIMEditable';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { TestSlotOwner } from '../../../tests/support/TestSlotOwner';

type TRow = { id: string };

const LIBRARY_SLOT_FLAG = 32;

describe('what an unsafe mutation of a slot may do', () => {
    it('runs the mutation on the slot itself, so a library can set a bit of its own', () => {
        const db = new OIMDB();
        const rowsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TRow, string>() });
        const slot = rowsService.writeSlotContentByKey(rowsService.createStoreSlot(db), 'r', { id: 'r' });

        slot.owner.unsafeMutateSlot(slot, editableSlot => { editableSlot.slotFlags |= LIBRARY_SLOT_FLAG; });

        expect(slot.slotFlags & LIBRARY_SLOT_FLAG).toBe(LIBRARY_SLOT_FLAG);
    });

    it('goes through the owner, so a subclass can hook every unsafe mutation', () => {
        const mutatedSlots: TOIMSlot[] = [];
        class OIMSlotOwnerThatSeesUnsafeMutations extends TestSlotOwner {

            public override unsafeMutateSlot(slot: TOIMSlot, mutateSlot: (editableSlot: TOIMEditable<TOIMSlot>) => void): void {
                mutatedSlots.push(slot);
                super.unsafeMutateSlot(slot, mutateSlot);
            }
        }
        const owner = new OIMSlotOwnerThatSeesUnsafeMutations();
        const slot = { slotFlags: 0 } as TOIMSlot;

        owner.unsafeMutateSlot(slot, editableSlot => { editableSlot.slotFlags |= LIBRARY_SLOT_FLAG; });

        expect(mutatedSlots).toEqual([slot]);
        expect(slot.slotFlags).toBe(LIBRARY_SLOT_FLAG);
    });
});
