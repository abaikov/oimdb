import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { OIMSlotStoreServiceTreeDriven } from '../../store/OIMSlotStoreServiceTreeDriven';
import { OIMKeyTreeWalkScalar } from '../OIMKeyTreeWalkScalar';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, readonly TOIMStoreKey[]>;

const filed = (key: readonly TOIMStoreKey[]): TCardSlot =>
    createOIMEntitySlot<TCard, readonly TOIMStoreKey[]>(key, new OIMSlotOwner());

const createFixture = () => {
    const slotStoreServiceTreeDriven = new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TCardSlot>(new OIMKeyTreeWalkScalar());
    const slotStoreTree = slotStoreServiceTreeDriven.createStore();
    const fileUnder = (key: readonly TOIMStoreKey[]): TCardSlot => {
        const slot = filed(key);
        slotStoreServiceTreeDriven.set(slotStoreTree, key, slot);
        return slot;
    };
    return { slotStoreServiceTreeDriven, slotStoreTree, fileUnder };
};

describe('deleting a composite key', () => {
    it('walks the key once: one map lookup per part, and no array of the path', () => {
        const { slotStoreServiceTreeDriven, slotStoreTree, fileUnder } = createFixture();
        fileUnder(['u1', 'p7', 'c3']);
        const mapGet = jest.spyOn(Map.prototype, 'get');
        const arrayPush = jest.spyOn(Array.prototype, 'push');

        slotStoreServiceTreeDriven.remove(slotStoreTree, ['u1', 'p7', 'c3']);
        const mapGetCount = mapGet.mock.calls.length;
        const arrayPushCount = arrayPush.mock.calls.length;
        mapGet.mockRestore();
        arrayPush.mockRestore();

        expect(mapGetCount).toBe(3);
        expect(arrayPushCount).toBe(0);
    });

    it('takes only the value at the key: a longer key under it stays reachable', () => {
        const { slotStoreServiceTreeDriven, slotStoreTree, fileUnder } = createFixture();
        const p7 = fileUnder(['u1', 'p7']);
        const x = fileUnder(['u1', 'p7', 'x']);

        slotStoreServiceTreeDriven.remove(slotStoreTree, ['u1', 'p7']);

        expect(slotStoreServiceTreeDriven.get(slotStoreTree, ['u1', 'p7'])).toBeUndefined();
        expect(slotStoreServiceTreeDriven.get(slotStoreTree, ['u1', 'p7', 'x'])).toBe(x);
        expect([...slotStoreServiceTreeDriven.getSlots(slotStoreTree)]).toEqual([x]);
        expect(p7.key).toEqual(['u1', 'p7']);
    });

    it('unlinks every node the delete left empty, and stops at one that still leads somewhere', () => {
        const { slotStoreServiceTreeDriven, slotStoreTree, fileUnder } = createFixture();
        fileUnder(['u1', 'p7', 'c3']);
        fileUnder(['u1', 'p9']);

        slotStoreServiceTreeDriven.remove(slotStoreTree, ['u1', 'p7', 'c3']);

        const u1 = slotStoreTree.root.childNodes?.get('u1');
        expect(u1).toBeDefined();
        expect([...(u1?.childNodes?.keys() ?? [])]).toEqual(['p9']);

        slotStoreServiceTreeDriven.remove(slotStoreTree, ['u1', 'p9']);

        expect(slotStoreTree.root.childNodes?.size ?? 0).toBe(0);
    });

    it('a key that is only a prefix of filed keys deletes nothing', () => {
        const { slotStoreServiceTreeDriven, slotStoreTree, fileUnder } = createFixture();
        const c3 = fileUnder(['u1', 'p7', 'c3']);

        slotStoreServiceTreeDriven.remove(slotStoreTree, ['u1', 'p7']);
        slotStoreServiceTreeDriven.remove(slotStoreTree, ['u1', 'nowhere']);

        expect(slotStoreServiceTreeDriven.get(slotStoreTree, ['u1', 'p7', 'c3'])).toBe(c3);
        expect(slotStoreServiceTreeDriven.getSlotCount(slotStoreTree)).toBe(1);
    });
});
