import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMErrorPolicyThrowAtOnce } from '../../error/OIMErrorPolicyThrowAtOnce';
import { createOIMEntityWriterInPlace } from '../../../factories/createOIMEntityWriterInPlace';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { IOIMEntityWriter } from '../interfaces/IOIMEntityWriter';
import type { TOIMChannelScheduler } from '../../channel/types/TOIMChannelScheduler';

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
    const db = new OIMDB({ channelScheduler, errorPolicy: new OIMErrorPolicyThrowAtOnce() });
    OIMChannelService.INSTANCE.subscribeAfterEachFlush(db.defaultChannelSlot, () => { framesEnded++; });
    return { db, armed: () => armed, framesEnded: () => framesEnded };
};

const collectionOn = (db: OIMDB, write: IOIMEntityWriter) => {
    const collectionService = createOIMEntityService<TCard>(db, {
        keyOf: (card: TCard) => card.id,
        entityWriter: write,
    });
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
    if (slot !== undefined) collectionService.slotContentService.deleteEntity(slot);
};

describe('a collection over a writer', () => {
    it('stores slots and reads them back', () => {
        const db = new OIMDB();
        const on = collectionOn(db, createOIMEntityWriterInPlace());
        const { collectionService, collection } = on;

        collectionService.slotContentService.upsertEntities(collection, cards(50));

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
        const on = collectionOn(db, createOIMEntityWriterInPlace());
        const { collectionService, collection } = on;

        collectionService.slotContentService.upsertEntities(collection, cards(4));
        deleteEntityByKey(on, 'c1');
        db.flush();

        expect(collectionService.getSlotCount(collection)).toBe(3);
        expect(Array.from(collectionService.getSlots(collection)).map(slot => slot.key)).not.toContain('c1');
    });

    it('lets two collections share one writer', () => {
        const shared = createOIMEntityWriterInPlace();
        const db = new OIMDB();
        const one = collectionOn(db, shared);
        const two = collectionOn(db, shared);

        one.collectionService.slotContentService.upsertEntity(one.collection, { id: 'c1', deckId: 'd0', title: 'one' });
        two.collectionService.slotContentService.upsertEntity(two.collection, { id: 'c2', deckId: 'd0', title: 'two' });

        expect(Array.from(one.collectionService.getSlots(one.collection)).map(slot => slot.key)).toEqual(['c1']);
        expect(Array.from(two.collectionService.getSlots(two.collection)).map(slot => slot.key)).toEqual(['c2']);
    });

    it('marks, arms a scheduler and delivers', () => {
        const { db, armed, framesEnded } = countingDb();
        const { collectionService, collection } = collectionOn(db, createOIMEntityWriterInPlace());
        let woken = 0;
        const heldSlot = collectionService.holdSlotByKey(collection, 'c3');
        OIMEffectService.INSTANCE.createEffect(db, [heldSlot], [], () => { woken++; });

        collectionService.slotContentService.upsertEntities(collection, cards(100));

        expect(armed()).toBeGreaterThan(0);
        expect(db.clock.revision).toBeGreaterThan(0);

        db.flush();
        expect(woken).toBe(1);
        expect(framesEnded()).toBe(1);
        expect(collectionService.getSlotByKey(collection, 'c3')?.entity?.title).toBe('card 3');
    });

    it('marks a row once per frame however many rows arrived', () => {
        const { db } = countingDb();
        const { collectionService, collection } = collectionOn(db, createOIMEntityWriterInPlace());
        let woken = 0;
        const heldSlot = collectionService.holdSlotByKey(collection, 'c3');
        OIMEffectService.INSTANCE.createEffect(db, [heldSlot], [], () => { woken++; });

        collectionService.slotContentService.upsertEntities(collection, cards(100));
        expect(collectionService.getSlotCount(collection)).toBe(100);
        expect(heldSlot.changedAtRevision).toBeGreaterThan(0);
        db.flush();
        expect(woken).toBe(1);
    });

    it('refuses a write during a frame', () => {
        const { db } = countingDb();
        const { collectionService, collection } = collectionOn(db, createOIMEntityWriterInPlace());
        const trigger = collectionOn(db, createOIMEntityWriterInPlace());

        OIMEffectService.INSTANCE.createEffect(db, [trigger.collectionService.holdSlotByKey(trigger.collection, 't')], [], () => {
            collectionService.slotContentService.upsertEntity(collection, { id: 'c0', deckId: 'd0', title: 'from inside' });
        });
        trigger.collectionService.slotContentService.upsertEntity(trigger.collection, { id: 't', deckId: 'd0', title: 'trigger' });

        expect(() => { db.flush(); }).toThrow('writes are refused for the whole of a flush');
        expect(collectionService.getSlotCount(collection)).toBe(0);
    });
});
