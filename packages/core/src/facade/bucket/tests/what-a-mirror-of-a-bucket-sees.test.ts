import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../OIMSlotContentBucketServiceSetDriven';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEffect } from '../../../engine/computed/types/TOIMEffect';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';

type TCard = { id: string; deckId: string; title: string; draft: boolean };
type TSlots = TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>;

/**
 * The whole pattern, in the primitives that already exist: watch the bucket for
 * who is in it, watch each slot for what it says. Nothing is polled and nothing
 * is filtered out of somebody else's list.
 */
function mirrorBucket(
    db: OIMDB,
    effectService: OIMEffectService,
    collection: OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>,
    bucket: TOIMBucketSlot<TSlots, TOIMStoreKey>,
    onFrame: (written: TOIMEntitySlot<TCard>[], deleted: TOIMEntitySlot<TCard>[]) => void,
): () => void {
    const watched = new Map<TOIMEntitySlot<TCard>, TOIMEffect>();
    let written = new Set<TOIMEntitySlot<TCard>>();
    let deleted = new Set<TOIMEntitySlot<TCard>>();

    const deliverPending = (): void => {
        if (written.size === 0 && deleted.size === 0) return;
        onFrame(Array.from(written), Array.from(deleted));
        written = new Set(); deleted = new Set();
    };

    /** Returns true when this is an ARRIVAL, so a change to the bucket's slots
     *  does not re-write everything that merely stayed. */
    const watch = (slot: TOIMEntitySlot<TCard>): boolean => {
        if (watched.has(slot)) return false;
        watched.set(slot, effectService.createEffect(db, [slot], [], () => {
            if (slot.entity === undefined) deleted.add(slot); else written.add(slot);
        }));
        return true;
    };
    const disposeSlotEffect = (slot: TOIMEntitySlot<TCard>): void => {
        const effect = watched.get(slot);
        if (effect !== undefined) { effectService.disposeEffect(effect); watched.delete(slot); }
    };

    const sync = (): void => {
        const present = new Set(collection.getBucketMemberSlots(bucket));
        for (const slot of present) if (watch(slot)) written.add(slot);
        for (const slot of Array.from(watched.keys())) {
            if (!present.has(slot)) { deleted.add(slot); disposeSlotEffect(slot); }
        }
    };
    sync();
    deliverPending();
    const bucketEffect = effectService.createEffect(db, [bucket], [], sync);
    // One hook for the whole runtime: a slot can move without the bucket's
    // slots moving, so waiting on the bucket alone would miss it, and a
    // second effect per slot to catch it would be two where one does.
    const offFrame = OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, deliverPending);
    return () => {
        effectService.disposeEffect(bucketEffect);
        offFrame();
        for (const effect of watched.values()) effectService.disposeEffect(effect);
    };
}

const createFixture =() => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, TOIMStoreKey>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const viewService = createOIMBucketService<
        TOIMEntitySlot<TCard>, TOIMStoreKey, TSlots, OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>() });
    const view = viewService.createStoreSlot(db);
    const bucketAt =(key: TOIMStoreKey): TOIMBucketSlot<TSlots, TOIMStoreKey> => {
        return viewService.holdSlotByKey(view, key);
    };
    return { db, effectService, cards, cardsService, viewService, bucketAt };
};

describe('what a mirror of a bucket sees', () => {
    it('sees content changes, arrivals and departures, all as effects', () => {
        const { db, effectService, cards, cardsService, viewService, bucketAt } = createFixture();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'beta', draft: false },
        ]);
        db.flush();
        const bucket = bucketAt('everything');
        viewService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1'), cardsService.getSlotByKey(cards, 'c2')]);
        db.flush();

        const frames: { written: string[]; deleted: string[] }[] = [];
        mirrorBucket(db, effectService, viewService.slotContentService, bucket, (written, deleted) => {
            frames.push({
                written: written.map(s => String(s.key)).sort(),
                deleted: deleted.map(s => String(s.key)).sort(),
            });
        });
        db.flush();
        expect(frames[0]).toEqual({ written: ['c1', 'c2'], deleted: [] });

        // A content change: the bucket's slots did not move, the slot did.
        // This is the half no bucket subscription can see, and the reason the
        // mirror subscribes to each slot as well.
        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c1'), { title: 'ALPHA' });
        db.flush();
        expect(frames[1]).toEqual({ written: ['c1'], deleted: [] });

        // An arrival and a departure in one frame. The arrival is a slot the
        // caller writes in; the departure is a slot whose value went, which the
        // slot's own effect reports whether or not the caller has taken it out
        // of the list yet.
        cardsService.slotContentService.upsertEntity(cards, { id: 'c3', deckId: 'd1', title: 'gamma', draft: false });
        viewService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1'), cardsService.getSlotByKey(cards, 'c3')]);
        cardsService.slotContentService.deleteEntity(cardsService.getSlotByKey(cards, 'c2'));
        db.flush();
        expect(frames[2].written).toEqual(['c3']);
        expect(frames[2].deleted).toEqual(['c2']);
    });

    // The junk is never seen because it was never put in: with a bucket's slots
    // written by hand, keeping it out is the caller's discipline, not the engine's.
    it('mirrors only what the bucket holds, so what was never put in is never seen', () => {
        const { db, effectService, cards, cardsService, viewService, bucketAt } = createFixture();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'scratch', draft: true },
        ]);
        db.flush();
        const bucket = bucketAt('keep');
        viewService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')]);
        db.flush();

        const frames: { written: string[]; deleted: string[] }[] = [];
        mirrorBucket(db, effectService, viewService.slotContentService, bucket, (written, deleted) => {
            frames.push({
                written: written.map(s => String(s.key)).sort(),
                deleted: deleted.map(s => String(s.key)).sort(),
            });
        });
        db.flush();
        expect(frames[0]).toEqual({ written: ['c1'], deleted: [] });

        // The draft changes, twice. The mirror never hears about it: it is
        // subscribed to the bucket and to the bucket's slots, and this slot is
        // neither.
        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c2'), { title: 'scratch again' });
        db.flush();
        cardsService.slotContentService.updateEntity(cardsService.getSlotByKey(cards, 'c2'), { draft: false });
        db.flush();
        expect(frames.length).toBe(1);

        // Until the caller puts it in, and then it simply arrives.
        viewService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1'), cardsService.getSlotByKey(cards, 'c2')]);
        db.flush();
        expect(frames[1]).toEqual({ written: ['c2'], deleted: [] });

        // And leaves again when the caller takes it out.
        viewService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')]);
        db.flush();
        expect(frames[2]).toEqual({ written: [],deleted: ['c2'] });
    });
});
