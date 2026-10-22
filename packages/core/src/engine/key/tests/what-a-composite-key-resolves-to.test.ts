
import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { OIMSlotStoreServiceTreeDriven } from '../../store/OIMSlotStoreServiceTreeDriven';
import { OIMDefaults } from '../../../factories/OIMDefaults';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import { oimMarkSlotReleased } from '../../slot/utils/oimMarkSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type Segment = { id: string };

/** A bare identity to be a KEY SEGMENT — it is addressed by nothing itself. */
const segment = (id: string): TOIMEntitySlot =>
    createOIMEntitySlot<Segment, string>(id, new OIMSlotOwner()) as TOIMEntitySlot;

/** A slot to be FILED under a composite key. */
const filed = (): TOIMEntitySlot<Segment, readonly TOIMEntitySlot[]> =>
    createOIMEntitySlot<Segment, readonly TOIMEntitySlot[]>([], new OIMSlotOwner());

/** The identity arm of the chain store: the walk is the argument that picks it. */
const filedStore = () =>
    new OIMSlotStoreServiceTreeDriven<
        TOIMEntitySlot, TOIMEntitySlot<Segment, readonly TOIMEntitySlot[]>
    >(OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue());

describe('a list of identities is one key', () => {
    it('resolves a rebuilt list to the slot filed under the first one', () => {
        const service = filedStore();
        const store = service.createStore();
        const spades = segment('spades');
        const monday = segment('monday');
        const slot = filed();

        service.set(store, [spades, monday], slot);
        // A DIFFERENT ARRAY, the same two identities.
        expect(service.get(store, [spades, monday])).toBe(slot);
        expect(service.getSlotCount(store)).toBe(1);
    });

    it('keeps a key and its own prefix apart', () => {
        const service = filedStore();
        const store = service.createStore();
        const spades = segment('spades');
        const monday = segment('monday');
        const pair = filed();
        const one = filed();

        service.set(store, [spades, monday], pair);
        service.set(store, [spades], one);
        // `[spades]` and `[spades, monday]` are two keys. A tree that held both
        // in one map would answer the shorter with the longer's slot.
        expect(service.get(store, [spades])).toBe(one);
        expect(service.get(store, [spades, monday])).toBe(pair);
        expect(service.getSlotCount(store)).toBe(2);
    });

    it('answers nothing for a key nobody filed, and files nothing by asking', () => {
        const service = filedStore();
        const store = service.createStore();
        const spades = segment('spades');
        const tuesday = segment('tuesday');

        expect(service.get(store, [spades, tuesday])).toBeUndefined();
        // ASKING IS NOT MINTING — the descent leaves no node behind, or a store
        // keyed by a search term would keep one branch per query ever typed.
        expect(service.getSlotCount(store)).toBe(0);
        expect(spades.holdCount).toBe(0);
    });
});

describe('the key holds the identities it is made of', () => {
    it('takes one hold per EDGE, so a shared prefix is held once', () => {
        const service = filedStore();
        const store = service.createStore();
        const a = segment('a');
        const b = segment('b');
        const c = segment('c');

        service.set(store, [a, b], filed());
        service.set(store, [a, c], filed());

        // `a` is the first segment of both keys and is descended through twice,
        // but the edge under it was minted once — which is the whole reason the
        // hold is taken where a NODE is made and not per segment per key.
        expect(a.holdCount).toBe(1);
        expect(b.holdCount).toBe(1);
        expect(c.holdCount).toBe(1);
    });

    it('gives the holds back when the last key through them goes', () => {
        const service = filedStore();
        const store = service.createStore();
        const a = segment('a');
        const b = segment('b');
        const c = segment('c');

        service.set(store, [a, b], filed());
        service.set(store, [a, c], filed());
        expect(a.holdCount).toBe(1);

        // ONE OF TWO BRANCHES GOES. `a` is still reached by the other, so its
        // edge stays and so does its hold.
        service.remove(store, [a, b]);
        expect(service.getSlotCount(store)).toBe(1);
        expect(b.holdCount).toBe(0);
        expect(a.holdCount).toBe(1);

        // AND THE LAST ONE. Now nothing is under `a`, so the level that existed
        // only to reach it is pruned and the hold comes back — without which a
        // store keyed by identities would keep every segment ever used for the
        // life of the process.
        service.remove(store, [a, c]);
        expect(service.getSlotCount(store)).toBe(0);
        expect(c.holdCount).toBe(0);
        expect(a.holdCount).toBe(0);
    });
});

describe('the key on the slot is the store\'s own copy', () => {
    it('does not alias the array the caller handed in', () => {
        const service = filedStore();
        const store = service.createStore();
        const a = segment('a');
        const b = segment('b');
        const slot = filed();

        const handedIn: TOIMEntitySlot[] = [a, b];
        const ownedKey = service.ownKey(handedIn);
        service.set(store, handedIn, slot);
        // The caller keeps their array and is free to reuse it. A store that
        // aliased it would find the slot filed at a key that changed under it.
        handedIn.length = 0;

        expect(service.get(store, [a, b])).toBe(slot);
        expect(ownedKey).toEqual([a, b]);
    });
});

describe('a key naming a released identity', () => {
    const released = (id: string): TOIMEntitySlot => {
        const releasedSegment = segment(id);
        oimMarkSlotReleased(releasedSegment);
        return releasedSegment;
    };

    it('is refused every time, and never files a slot under it', () => {
        const service = filedStore();
        const store = service.createStore();
        const live = segment('live');
        const dead = released('dead');
        const slot = filed();

        expect(() => { service.set(store, [live, dead], slot); }).toThrow(/released/);
        expect(() => { service.set(store, [live, dead], slot); }).toThrow(/released/);
        expect(service.get(store, [live, dead])).toBeUndefined();
    });

    it('leaves no node and no hold behind on the identities before it', () => {
        const service = filedStore();
        const store = service.createStore();
        const live = segment('live');
        const dead = released('dead');

        expect(() => { service.set(store, [live, dead], filed()); }).toThrow(/released/);

        expect(live.holdCount).toBe(0);
        expect(store.root.childNodes?.size ?? 0).toBe(0);
    });
});
