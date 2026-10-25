import { OIMSingleSlotStoreService } from '../OIMSingleSlotStoreService';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TSlot = TOIMSlot & { name: string };

describe('what a single-slot store lists', () => {
    const slotStoreService = new OIMSingleSlotStoreService<TSlot>();

    it('lists nothing and counts zero before its slot is filed', () => {
        const store = slotStoreService.createStore();

        expect(Array.from(slotStoreService.getSlots(store))).toEqual([]);
        expect(slotStoreService.getSlotCount(store)).toBe(0);
    });

    it('lists its one slot and counts one once it is filed', () => {
        const store = slotStoreService.createStore();
        const slot = { name: 'the one' } as TSlot;
        slotStoreService.fileSlot(store, slot);

        expect(Array.from(slotStoreService.getSlots(store))).toEqual([slot]);
        expect(slotStoreService.getSlotCount(store)).toBe(1);
    });

    it('lists nothing again after the slot is unfiled', () => {
        const store = slotStoreService.createStore();
        const slot = { name: 'gone' } as TSlot;
        slotStoreService.fileSlot(store, slot);
        slotStoreService.unfileSlot(store);

        expect(Array.from(slotStoreService.getSlots(store))).toEqual([]);
        expect(slotStoreService.getSlotCount(store)).toBe(0);
    });
});
