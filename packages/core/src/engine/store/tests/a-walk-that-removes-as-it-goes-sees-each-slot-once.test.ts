import { OIMSlotStoreServiceMapDriven } from '../OIMSlotStoreServiceMapDriven';
import { OIMSlotStoreServiceTreeDriven } from '../OIMSlotStoreServiceTreeDriven';
import { OIMSlotStoreServiceSingleSlotDriven } from '../OIMSlotStoreServiceSingleSlotDriven';
import { OIMColumnSlotStoreServiceOrdinalDriven } from '../../column/OIMColumnSlotStoreServiceOrdinalDriven';
import { OIMKeyTreeWalkScalar } from '../../key/OIMKeyTreeWalkScalar';
import type { IOIMSlotStoreService } from '../interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMStoreKey } from '../types/TOIMStoreKey';

const slotUnder = <TKey>(key: TKey): TOIMKeyedSlot<TKey> => ({ key }) as unknown as TOIMKeyedSlot<TKey>;

const walkRemovingEachVisited = <TKey, TStore>(
    slotStoreService: IOIMSlotStoreService<TKey, TOIMKeyedSlot<TKey>, TStore>, keys: readonly TKey[],
): { filed: TOIMKeyedSlot<TKey>[]; visited: TOIMKeyedSlot<TKey>[]; leftCount: number } => {
    const store = slotStoreService.createStore();
    const filed = keys.map(key => slotUnder(key));
    for (const slot of filed) slotStoreService.set(store, slot.key, slot);
    const visited: TOIMKeyedSlot<TKey>[] = [];
    for (const slot of slotStoreService.getSlots(store)) {
        visited.push(slot);
        slotStoreService.remove(store, slot.key);
    }
    return { filed, visited, leftCount: slotStoreService.getSlotCount(store) };
};

const expectEachOnceAndNoneLeft = <TKey>(walk: { filed: TOIMKeyedSlot<TKey>[]; visited: TOIMKeyedSlot<TKey>[]; leftCount: number }): void => {
    expect(walk.visited).toHaveLength(walk.filed.length);
    expect(new Set(walk.visited)).toEqual(new Set(walk.filed));
    expect(walk.leftCount).toBe(0);
};

describe('a walk over a store that removes the slot it is on', () => {
    it('visits every slot of a map-driven store once and leaves it empty', () => {
        expectEachOnceAndNoneLeft(walkRemovingEachVisited(
            new OIMSlotStoreServiceMapDriven<TOIMKeyedSlot<string>, string>(), ['a', 'b', 'c', 'd', 'e'],
        ));
    });

    it('visits every slot of a tree-driven store once and leaves it empty', () => {
        expectEachOnceAndNoneLeft(walkRemovingEachVisited(
            new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TOIMKeyedSlot<readonly TOIMStoreKey[]>>(new OIMKeyTreeWalkScalar()),
            [['a', 1], ['a', 2], ['b', 1], ['b', 2], ['c']],
        ));
    });

    it('visits the one slot of a single-slot store once and leaves it empty', () => {
        expectEachOnceAndNoneLeft(walkRemovingEachVisited(
            new OIMSlotStoreServiceSingleSlotDriven<TOIMKeyedSlot<void>>(), [undefined],
        ));
    });

    it('visits every slot of an ordinal column store once and leaves it empty', () => {
        expectEachOnceAndNoneLeft(walkRemovingEachVisited(
            new OIMColumnSlotStoreServiceOrdinalDriven<TOIMKeyedSlot<string>>({ columnNames: ['a', 'b', 'c', 'd'] }),
            ['a', 'b', 'c', 'd'],
        ));
    });
});
