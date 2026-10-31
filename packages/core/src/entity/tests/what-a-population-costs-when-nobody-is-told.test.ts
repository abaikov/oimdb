import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMThrowAtOnceErrorPolicy } from '../../error/OIMThrowAtOnceErrorPolicy';
import { createOIMInPlaceEntityWriter } from '../createOIMInPlaceEntityWriter';
import type { IOIMEntityWriter } from '../interfaces/IOIMEntityWriter';
import type { TOIMChannelScheduler } from '../../channel/types/TOIMChannelScheduler';
import { createOIMEntityContentService } from '../createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deckId: string; title: string };

const cards = (count: number): TCard[] => {
    const out: TCard[] = [];
    for (let i = 0; i < count; i++) out.push({ id: `c${i}`, deckId: `d${i % 4}`, title: `card ${i}` });
    return out;
};

const countingDb = (): { db: OIMDB; armed: () => number; framesEnded: () => number } => {
    let armed = 0;
    let framesEnded = 0;
    const channelScheduler: TOIMChannelScheduler = () => { armed++; };
    const db = new OIMDB({ channelScheduler, errorPolicy: new OIMThrowAtOnceErrorPolicy() });
    OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, () => { framesEnded++; });
    return { db, armed: () => armed, framesEnded: () => framesEnded };
};

const collectionOn = (db: OIMDB, write: IOIMEntityWriter) => {
    const collectionService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>({ entityWriter: write }) });
    return { collectionService, collection: collectionService.createStoreSlot(db) };
};

const updateEntityByKey = (
    { collectionService, collection }: ReturnType<typeof collectionOn>, key: string, patch: Partial<TCard>,
): void => {
    const slot = collectionService.findSlotByKey(collection, key);
    if (slot !== undefined) collectionService.slotContentService.updateEntity(slot, patch);
};

const deleteEntityByKey = ({ collectionService, collection }: ReturnType<typeof collectionOn>, key: string): void => {
    const slot = collectionService.findSlotByKey(collection, key);
    if (slot !== undefined) collectionService.slotContentService.clearSlotContent(slot);
};

describe('a collection over a writer', () => {
    it('stores slots and reads them back', () => {
        const db = new OIMDB();
        const on = collectionOn(db, createOIMInPlaceEntityWriter());
        const { collectionService, collection } = on;

        collectionService.writeInBatch(collection, () => (cards(50)).map(entity => collectionService.writeSlotContentByKey(collection, entity.id, entity)));

        expect(collectionService.getSlotByKey(collection, 'c7')?.entity).toEqual({ id: 'c7', deckId: 'd3', title: 'card 7' });
        expect(collectionService.getSlotByKey(collection, 'c49')?.entity?.title).toBe('card 49');
        expect(collectionService.getSlotByKey(collection, 'c50').entity).toBeUndefined();
        expect(collectionService.getSlotCount(collection)).toBe(51);
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(collectionService.getSlotCount(collection)).toBe(50);

        updateEntityByKey(on, 'c7', { title: 'renamed' });
        expect(collectionService.getSlotByKey(collection, 'c7')?.entity?.title).toBe('renamed');

        const slot = collectionService.getSlotByKey(collection, 'c7')!;
        updateEntityByKey(on, 'c7', { title: 'renamed twice' });
        expect(collectionService.getSlotByKey(collection, 'c7')).toBe(slot);
        expect(slot.entity?.title).toBe('renamed twice');
    });

    it('lets a removed key go', () => {
        const { db } = countingDb();
        const on = collectionOn(db, createOIMInPlaceEntityWriter());
        const { collectionService, collection } = on;

        collectionService.writeInBatch(collection, () => (cards(4)).map(entity => collectionService.writeSlotContentByKey(collection, entity.id, entity)));
        deleteEntityByKey(on, 'c1');
        db.flush();

        expect(collectionService.getSlotCount(collection)).toBe(3);
        expect(Array.from(collectionService.getSlots(collection)).map(slot => slot.key)).not.toContain('c1');
    });

    it('lets two collections share one writer', () => {
        const shared = createOIMInPlaceEntityWriter();
        const db = new OIMDB();
        const one = collectionOn(db, shared);
        const two = collectionOn(db, shared);

        one.collectionService.writeSlotContentByKey(one.collection, 'c1', { id: 'c1', deckId: 'd0', title: 'one' });
        two.collectionService.writeSlotContentByKey(two.collection, 'c2', { id: 'c2', deckId: 'd0', title: 'two' });

        expect(Array.from(one.collectionService.getSlots(one.collection)).map(slot => slot.key)).toEqual(['c1']);
        expect(Array.from(two.collectionService.getSlots(two.collection)).map(slot => slot.key)).toEqual(['c2']);
    });

    it('marks, arms a scheduler and delivers', () => {
        const { db, armed, framesEnded } = countingDb();
        const { collectionService, collection } = collectionOn(db, createOIMInPlaceEntityWriter());
        let woken = 0;
        const heldSlot = collectionService.holdSlotByKey(collection, 'c3');
        OIMEffectService.INSTANCE.createEffect(db, () => { woken++; }, [heldSlot]);

        collectionService.writeInBatch(collection, () => (cards(100)).map(entity => collectionService.writeSlotContentByKey(collection, entity.id, entity)));

        expect(armed()).toBeGreaterThan(0);
        expect(db.clock.revision).toBeGreaterThan(0);

        db.flush();
        expect(woken).toBe(1);
        expect(framesEnded()).toBe(1);
        expect(collectionService.getSlotByKey(collection, 'c3')?.entity?.title).toBe('card 3');
    });

    it('marks a row once per frame however many rows arrived', () => {
        const { db } = countingDb();
        const { collectionService, collection } = collectionOn(db, createOIMInPlaceEntityWriter());
        let woken = 0;
        const heldSlot = collectionService.holdSlotByKey(collection, 'c3');
        OIMEffectService.INSTANCE.createEffect(db, () => { woken++; }, [heldSlot]);

        collectionService.writeInBatch(collection, () => (cards(100)).map(entity => collectionService.writeSlotContentByKey(collection, entity.id, entity)));
        expect(collectionService.getSlotCount(collection)).toBe(100);
        expect(heldSlot.changedAtRevision).toBeGreaterThan(0);
        db.flush();
        expect(woken).toBe(1);
    });

    it('refuses a write during a frame', () => {
        const { db } = countingDb();
        const { collectionService, collection } = collectionOn(db, createOIMInPlaceEntityWriter());
        const trigger = collectionOn(db, createOIMInPlaceEntityWriter());

        OIMEffectService.INSTANCE.createEffect(db, () => {
            collectionService.writeSlotContentByKey(collection, 'c0', { id: 'c0', deckId: 'd0', title: 'from inside' });
        }, [trigger.collectionService.holdSlotByKey(trigger.collection, 't')]);
        trigger.collectionService.writeSlotContentByKey(trigger.collection, 't', { id: 't', deckId: 'd0', title: 'trigger' });

        expect(() => { db.flush(); }).toThrow('writes are refused for the whole of a flush');
        expect(collectionService.getSlotCount(collection)).toBe(0);
    });
});
