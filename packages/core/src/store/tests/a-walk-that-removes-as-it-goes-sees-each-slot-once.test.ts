import { OIMSlotMapStoreService } from '../OIMSlotMapStoreService';
import { OIMSlotTreeStoreService } from '../OIMSlotTreeStoreService';
import { OIMColumnSlotOrdinalStoreService } from '../../column/OIMColumnSlotOrdinalStoreService';
import { OIMScalarKeyTreeWalk } from '../../key/OIMScalarKeyTreeWalk';
import type { IOIMSlotStoreService } from '../interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMStoreKey } from '../types/TOIMStoreKey';

const slotUnder = <TKey extends NonNullable<unknown>>(key: TKey): TOIMKeyedSlot<TKey> => ({ key }) as unknown as TOIMKeyedSlot<TKey>;

const walkRemovingEachVisited = <TKey extends NonNullable<unknown>, TStore>(
    slotStoreService: IOIMSlotStoreService<TKey, TOIMKeyedSlot<TKey>, TStore>, keys: readonly TKey[],
): { filed: TOIMKeyedSlot<TKey>[]; visited: TOIMKeyedSlot<TKey>[]; leftCount: number } => {
    const store = slotStoreService.createStore();
    const filed = keys.map(key => slotUnder(key));
    for (const slot of filed) slotStoreService.set(store, slot);
    const visited: TOIMKeyedSlot<TKey>[] = [];
    for (const slot of slotStoreService.getSlots(store)) {
        visited.push(slot);
        slotStoreService.delete(store, slot);
    }
    return { filed, visited, leftCount: slotStoreService.getSlotCount(store) };
};

const expectEachOnceAndNoneLeft = <TKey extends NonNullable<unknown>>(walk: { filed: TOIMKeyedSlot<TKey>[]; visited: TOIMKeyedSlot<TKey>[]; leftCount: number }): void => {
    expect(walk.visited).toHaveLength(walk.filed.length);
    expect(new Set(walk.visited)).toEqual(new Set(walk.filed));
    expect(walk.leftCount).toBe(0);
};

describe('a walk over a store that removes the slot it is on', () => {
    it('visits every slot of a map-driven store once and leaves it empty', () => {
        expectEachOnceAndNoneLeft(walkRemovingEachVisited(
            new OIMSlotMapStoreService<TOIMKeyedSlot<string>, string>(), ['a', 'b', 'c', 'd', 'e'],
        ));
    });

    it('visits every slot of a tree-driven store once and leaves it empty', () => {
        expectEachOnceAndNoneLeft(walkRemovingEachVisited(
            new OIMSlotTreeStoreService<TOIMStoreKey, TOIMKeyedSlot<readonly TOIMStoreKey[]>>(new OIMScalarKeyTreeWalk()),
            [['a', 1], ['a', 2], ['b', 1], ['b', 2], ['c']],
        ));
    });

    it('visits every slot of an ordinal column store once and leaves it empty', () => {
        expectEachOnceAndNoneLeft(walkRemovingEachVisited(
            new OIMColumnSlotOrdinalStoreService<TOIMKeyedSlot<string>>({ columnNames: ['a', 'b', 'c', 'd'], columnGroups: [] }),
            ['a', 'b', 'c', 'd'],
        ));
    });
});
