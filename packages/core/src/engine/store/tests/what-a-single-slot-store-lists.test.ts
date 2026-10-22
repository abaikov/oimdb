import { OIMSlotStoreServiceSingleSlotDriven } from '../OIMSlotStoreServiceSingleSlotDriven';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';

type TSlot = TOIMKeyedSlot<void> & { name: string };

describe('what a single-slot store lists', () => {
    const slotStoreService = new OIMSlotStoreServiceSingleSlotDriven<TSlot>();

    it('lists nothing and counts zero before its slot is set', () => {
        const store = slotStoreService.createStore();

        expect(Array.from(slotStoreService.getSlots(store))).toEqual([]);
        expect(slotStoreService.getSlotCount(store)).toBe(0);
    });

    it('lists its one slot and counts one once it is set', () => {
        const store = slotStoreService.createStore();
        const slot = { name: 'the one' } as TSlot;
        slotStoreService.set(store, undefined, slot);

        expect(Array.from(slotStoreService.getSlots(store))).toEqual([slot]);
        expect(slotStoreService.getSlotCount(store)).toBe(1);
    });

    it('lists nothing again after the slot is removed', () => {
        const store = slotStoreService.createStore();
        slotStoreService.set(store, undefined, { name: 'gone' } as TSlot);
        slotStoreService.remove(store);

        expect(Array.from(slotStoreService.getSlots(store))).toEqual([]);
        expect(slotStoreService.getSlotCount(store)).toBe(0);
    });
});
