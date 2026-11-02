import { OIMSlotTreeStoreService } from '../../store/OIMSlotTreeStoreService';
import { OIMScalarKeyTreeWalk } from '../OIMScalarKeyTreeWalk';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMStoreSlot } from '../../slot/utils/createOIMStoreSlot';
import { OIMDB } from '../../db/OIMDB';
import { TestSlotOwner } from '../../../tests/support/TestSlotOwner';

const testStoreSlot = createOIMStoreSlot(undefined, new OIMDB().defaultChannelSlot, undefined);

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, readonly TOIMStoreKey[]>;

const filed = (key: readonly TOIMStoreKey[]): TCardSlot =>
    createOIMEntitySlot<TCard, readonly TOIMStoreKey[]>(key, new TestSlotOwner(), testStoreSlot);

const createFixture = () => {
    const slotTreeStoreService = new OIMSlotTreeStoreService<TOIMStoreKey, TCardSlot>(new OIMScalarKeyTreeWalk());
    const slotStoreTree = slotTreeStoreService.createStore();
    const fileUnder = (key: readonly TOIMStoreKey[]): TCardSlot => {
        const slot = filed(key);
        slotTreeStoreService.set(slotStoreTree, slot);
        return slot;
    };
    return { slotTreeStoreService, slotStoreTree, fileUnder };
};

describe('deleting a composite key', () => {
    it('walks the key once: one map lookup per part, and no array of the path', () => {
        const { slotTreeStoreService, slotStoreTree, fileUnder } = createFixture();
        fileUnder(['u1', 'p7', 'c3']);
        const mapGet = jest.spyOn(Map.prototype, 'get');
        const arrayPush = jest.spyOn(Array.prototype, 'push');

        slotTreeStoreService.delete(slotStoreTree, filed(['u1', 'p7', 'c3']));
        const mapGetCount = mapGet.mock.calls.length;
        const arrayPushCount = arrayPush.mock.calls.length;
        mapGet.mockRestore();
        arrayPush.mockRestore();

        expect(mapGetCount).toBe(3);
        expect(arrayPushCount).toBe(0);
    });

    it('takes only the value at the key: a longer key under it stays reachable', () => {
        const { slotTreeStoreService, slotStoreTree, fileUnder } = createFixture();
        const p7 = fileUnder(['u1', 'p7']);
        const x = fileUnder(['u1', 'p7', 'x']);

        slotTreeStoreService.delete(slotStoreTree, filed(['u1', 'p7']));

        expect(slotTreeStoreService.get(slotStoreTree, ['u1', 'p7'])).toBeUndefined();
        expect(slotTreeStoreService.get(slotStoreTree, ['u1', 'p7', 'x'])).toBe(x);
        expect([...slotTreeStoreService.getSlots(slotStoreTree)]).toEqual([x]);
        expect(p7.key).toEqual(['u1', 'p7']);
    });

    it('unlinks every node the delete left empty, and stops at one that still leads somewhere', () => {
        const { slotTreeStoreService, slotStoreTree, fileUnder } = createFixture();
        fileUnder(['u1', 'p7', 'c3']);
        fileUnder(['u1', 'p9']);

        slotTreeStoreService.delete(slotStoreTree, filed(['u1', 'p7', 'c3']));

        const u1 = slotStoreTree.rootCompositeKeyNode.childNodes?.get('u1');
        expect(u1).toBeDefined();
        expect([...(u1?.childNodes?.keys() ?? [])]).toEqual(['p9']);

        slotTreeStoreService.delete(slotStoreTree, filed(['u1', 'p9']));

        expect(slotStoreTree.rootCompositeKeyNode.childNodes?.size ?? 0).toBe(0);
    });

    it('a key that is only a prefix of filed keys deletes nothing', () => {
        const { slotTreeStoreService, slotStoreTree, fileUnder } = createFixture();
        const c3 = fileUnder(['u1', 'p7', 'c3']);

        slotTreeStoreService.delete(slotStoreTree, filed(['u1', 'p7']));
        slotTreeStoreService.delete(slotStoreTree, filed(['u1', 'nowhere']));

        expect(slotTreeStoreService.get(slotStoreTree, ['u1', 'p7', 'c3'])).toBe(c3);
        expect(slotTreeStoreService.getSlotCount(slotStoreTree)).toBe(1);
    });
});
