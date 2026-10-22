import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { OIMChannelQueue } from '../../channel/OIMChannelQueue';
import type { IOIMContentChangeListener } from '../interfaces/IOIMContentChangeListener';
import type { TOIMStoreSlot } from '../types/TOIMStoreSlot';
import { OIMContentChangeDeliveryService } from '../OIMContentChangeDeliveryService';
import { OIMContentChangeListenerService } from '../OIMContentChangeListenerService';
import { OIMSlotStoreServiceMapDriven } from '../../store/OIMSlotStoreServiceMapDriven';
import { OIMSlotReleasePolicyAtUnhold } from '../../collector/OIMSlotReleasePolicyAtUnhold';

type TRow = { id: string; n: number };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;
type TSubframeDoors = { openSubframe(): void; closeSubframe(): void };

const subframeDoorsOf = (db: OIMDB): TSubframeDoors => ({
    openSubframe: () => { OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(db.defaultChannelSlot); },
    closeSubframe: () => { OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(db.defaultChannelSlot); },
});

const addListener = (
    storeSlot: TOIMStoreSlot<unknown, TRowSlot, Partial<TRow>>, listener: IOIMContentChangeListener<TRowSlot, Partial<TRow>>,
): void => {
    OIMContentChangeListenerService.INSTANCE.addContentChangeListener(storeSlot, listener, undefined);
};

const writeDuringDelivery = (writeInOwnSubframe: boolean): TOIMStoreKey[] => {
    const db = new OIMDB();
    const entityService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    const subframeDoors = subframeDoorsOf(db);
    const firstStoreSlot = entityService.createStoreSlot(db);
    const secondStoreSlot = entityService.createStoreSlot(db);
    const heardKeys: TOIMStoreKey[] = [];
    let isWritten = false;
    addListener(firstStoreSlot, {
        onContentChanged: () => {
            if (isWritten) return;
            isWritten = true;
            if (writeInOwnSubframe) subframeDoors.openSubframe();
            entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'later', n: 2 });
            if (writeInOwnSubframe) subframeDoors.closeSubframe();
        },
        onContentChangedMany: () => undefined,
    });
    addListener(secondStoreSlot, {
        onContentChanged: (slot: TRowSlot) => { heardKeys.push(slot.key); },
        onContentChangedMany: (slots: OIMChannelQueue<TRowSlot>) => {
            for (let i = 0; i < slots.getEntryCount(); i++) heardKeys.push(slots.getEntryAt(i).key);
        },
    });
    subframeDoors.openSubframe();
    entityService.slotContentService.upsertEntity(firstStoreSlot, { id: 'a', n: 0 });
    entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'earlier', n: 1 });
    subframeDoors.closeSubframe();
    return heardKeys;
};

const listenRecording = (heardKeys: TOIMStoreKey[], onHeard: (key: TOIMStoreKey) => void = () => undefined) => ({
    onContentChanged: (slot: TRowSlot) => { heardKeys.push(slot.key); onHeard(slot.key); },
    onContentChangedMany: (slots: OIMChannelQueue<TRowSlot>) => {
        for (let i = 0; i < slots.getEntryCount(); i++) {
            heardKeys.push(slots.getEntryAt(i).key);
            onHeard(slots.getEntryAt(i).key);
        }
    },
});

const threeStores = () => {
    const db = new OIMDB();
    const entityService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    const subframeDoors = subframeDoorsOf(db);
    return {
        db,
        entityService,
        subframeDoors,
        firstStoreSlot: entityService.createStoreSlot(db),
        secondStoreSlot: entityService.createStoreSlot(db),
        thirdStoreSlot: entityService.createStoreSlot(db),
    };
};

describe('a write made during a delivery that is itself made during a delivery', () => {
    it('reaches its store after both batches before it', () => {
        const { entityService, subframeDoors, firstStoreSlot, secondStoreSlot, thirdStoreSlot } = threeStores();
        const secondHeard: TOIMStoreKey[] = [];
        const thirdHeard: TOIMStoreKey[] = [];
        addListener(firstStoreSlot, listenRecording([], key => {
            if (key === 'a') entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'later', n: 2 });
        }));
        addListener(secondStoreSlot, listenRecording(secondHeard, key => {
            if (key === 'later') entityService.slotContentService.upsertEntity(thirdStoreSlot, { id: 'deepest', n: 3 });
        }));
        addListener(thirdStoreSlot, listenRecording(thirdHeard));
        subframeDoors.openSubframe();
        entityService.slotContentService.upsertEntity(firstStoreSlot, { id: 'a', n: 0 });
        entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'earlier', n: 1 });
        entityService.slotContentService.upsertEntity(thirdStoreSlot, { id: 'first-of-third', n: 1 });
        subframeDoors.closeSubframe();
        expect(secondHeard).toEqual(['earlier', 'later']);
        expect(thirdHeard).toEqual(['first-of-third', 'deepest']);
    });
});

class OIMSlotStoreServiceCountingRemovals extends OIMSlotStoreServiceMapDriven<TRowSlot> {
    public readonly removalCountsByKey = new Map<TOIMStoreKey, number>();

    public override remove(store: Map<TOIMStoreKey, TRowSlot>, key: TOIMStoreKey): void {
        this.removalCountsByKey.set(key, (this.removalCountsByKey.get(key) ?? 0) + 1);
        super.remove(store, key);
    }
}

describe('a slot written during a batched delivery, under a policy that releases a written slot nobody holds', () => {
    it('is released exactly once, and so is every slot of the batch it was written behind', () => {
        const slotStoreService = new OIMSlotStoreServiceCountingRemovals();
        const db = new OIMDB({ channelScheduler: (): void => undefined });
        const entityService = createOIMEntityService<TRow>(db, {
            keyOf: row => row.id,
            entitySlotStoreService: slotStoreService,
            slotReleasePolicy: new OIMSlotReleasePolicyAtUnhold(),
        });
        const subframeDoors = subframeDoorsOf(db);
        const firstStoreSlot = entityService.createStoreSlot(db);
        const secondStoreSlot = entityService.createStoreSlot(db);
        addListener(firstStoreSlot, listenRecording([], key => {
            if (key === 'a') entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'later', n: 2 });
        }));
        addListener(secondStoreSlot, listenRecording([]));
        subframeDoors.openSubframe();
        entityService.slotContentService.upsertEntity(firstStoreSlot, { id: 'a', n: 0 });
        entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'earlier', n: 1 });
        subframeDoors.closeSubframe();
        expect([...slotStoreService.removalCountsByKey.entries()].sort())
            .toEqual([['a', 1], ['earlier', 1], ['later', 1]]);
        expect(entityService.getSlotCount(firstStoreSlot) + entityService.getSlotCount(secondStoreSlot)).toBe(0);
    });
});

describe('a listener that writes its own store during a batched delivery', () => {
    it('hears that write after the batch it is in', () => {
        const { entityService, subframeDoors, firstStoreSlot, secondStoreSlot } = threeStores();
        const firstHeard: TOIMStoreKey[] = [];
        addListener(firstStoreSlot, listenRecording(firstHeard, key => {
            if (key === 'a') entityService.slotContentService.upsertEntity(firstStoreSlot, { id: 'again', n: 1 });
        }));
        subframeDoors.openSubframe();
        entityService.slotContentService.upsertEntity(firstStoreSlot, { id: 'a', n: 0 });
        entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'other', n: 0 });
        subframeDoors.closeSubframe();
        expect(firstHeard).toEqual(['a', 'again']);
    });
});

describe('a listener that throws during a batched delivery', () => {
    it('still lets every other store and every write made before the throw be heard, then rethrows', () => {
        const { entityService, subframeDoors, firstStoreSlot, secondStoreSlot } = threeStores();
        const secondHeard: TOIMStoreKey[] = [];
        addListener(firstStoreSlot, listenRecording([], key => {
            if (key !== 'a') return;
            entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'later', n: 2 });
            throw new Error('refused');
        }));
        addListener(secondStoreSlot, listenRecording(secondHeard));
        subframeDoors.openSubframe();
        entityService.slotContentService.upsertEntity(firstStoreSlot, { id: 'a', n: 0 });
        entityService.slotContentService.upsertEntity(secondStoreSlot, { id: 'earlier', n: 1 });
        expect(() => subframeDoors.closeSubframe()).toThrow('refused');
        expect(secondHeard).toEqual(['earlier', 'later']);
    });
});

describe('a listener of one store that writes another store of the same type during a batched delivery', () => {
    it('reaches that store after the batch it already had, when written bare', () => {
        expect(writeDuringDelivery(false)).toEqual(['earlier', 'later']);
    });

    it('reaches that store after the batch it already had, when written in a subframe of its own', () => {
        expect(writeDuringDelivery(true)).toEqual(['earlier', 'later']);
    });
});
