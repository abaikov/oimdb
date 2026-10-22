import {
    OIMDB, OIMSlotReleasePolicyAtEmpty, OIMChannelService, OIMContentChangeListenerService,
    OIMSlotContentBucketServiceSetDriven, createOIMBucketService, createOIMEntityService,
} from '../../../index';
import type {
    IOIMSlotReleasePolicy, TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMSlot, TOIMStoreKey,
} from '../../../index';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;

class OIMSlotReleasePolicyAtEmptyCounted implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = false;

    public readonly schedulesReleaseOnWrite = true;

    public slotsWritten = 0;

    private readonly slotReleasePolicyAtEmpty = new OIMSlotReleasePolicyAtEmpty();

    public onSlotWritten(): void {
        this.slotsWritten++;
    }

    public onSlotIdle(): boolean { return this.slotReleasePolicyAtEmpty.onSlotIdle(); }

    public onSlotUnheld(): void { return; }

    public isSlotReleasable(): boolean { return this.slotReleasePolicyAtEmpty.isSlotReleasable(); }

    public isEmptySlotReleasable(): boolean { return this.slotReleasePolicyAtEmpty.isEmptySlotReleasable(); }

    public cancelSlotRelease(): void { return; }
}

const createFixture = () => {
    const slotReleasePolicy = new OIMSlotReleasePolicyAtEmptyCounted();
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const pageService = createOIMBucketService(db, { slotReleasePolicy });
    const page = pageService.createStoreSlot(db);
    const bucket = pageService.holdSlotByKey(page, 'p');
    const [a, b, c] = ['a', 'b', 'c'].map(id => cardsService.slotContentService.upsertEntity(cards, { id }));
    const writtenSlots: TOIMSlot[] = [];
    const writeWithoutFlushCheck = OIMChannelService.prototype.writeWithoutFlushCheck;
    jest.spyOn(OIMChannelService.INSTANCE, 'writeWithoutFlushCheck').mockImplementation((channelSlot, slot) => {
        writtenSlots.push(slot);
        writeWithoutFlushCheck.call(OIMChannelService.INSTANCE, channelSlot, slot);
    });
    const bucketWrites = (): number => writtenSlots.filter(slot => slot === bucket).length;
    return { db, pageService, page, bucket, a, b, c, slotReleasePolicy, bucketWrites };
};

describe('what one batch of bucket writes wakes', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('says the bucket has content the moment a slot joins, inside the batch', () => {
        const { db, pageService, page, bucket, a } = createFixture();
        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        pageService.slotContentService.addBucketMemberSlots(bucket, [a]);
        expect(pageService.hasSlotContentByKey(page, 'p')).toBe(true);
        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
    });

    it('stamps a held bucket nobody listens to at every door of a batch, and adds nothing at close', () => {
        const { db, pageService, bucket, a, b, c, bucketWrites } = createFixture();
        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        pageService.slotContentService.addBucketMemberSlots(bucket, [a]);
        pageService.slotContentService.insertBucketMemberSlotAt(bucket, 1, b);
        pageService.slotContentService.addBucketMemberSlots(bucket, [c]);
        expect(bucketWrites()).toBe(3);
        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
        expect(bucketWrites()).toBe(3);
    });

    it('stamps a bucket a listener hears once at its first change and once more at close', () => {
        const { db, pageService, page, bucket, a, b, c, bucketWrites } = createFixture();
        OIMContentChangeListenerService.INSTANCE.addContentChangeListener(
            page, { onContentChanged: () => undefined, onContentChangedMany: () => undefined }, undefined,
        );
        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);
        pageService.slotContentService.addBucketMemberSlots(bucket, [a]);
        pageService.slotContentService.insertBucketMemberSlotAt(bucket, 1, b);
        pageService.slotContentService.addBucketMemberSlots(bucket, [c]);
        expect(bucketWrites()).toBe(1);
        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
        expect(bucketWrites()).toBe(2);
    });

    it('tells the release policy about a move, which is a write', () => {
        const { db, pageService, bucket, a, b, slotReleasePolicy } = createFixture();
        pageService.slotContentService.addBucketMemberSlots(bucket, [a, b]);
        db.flush();
        slotReleasePolicy.slotsWritten = 0;
        pageService.slotContentService.moveBucketMemberSlotToPosition(bucket, 0, 1);
        expect(slotReleasePolicy.slotsWritten).toBe(1);
    });

    it('tells the release policy nothing about a door that changed nothing', () => {
        const slotReleasePolicy = new OIMSlotReleasePolicyAtEmptyCounted();
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createOIMBucketService<
            TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
        >(db, { slotReleasePolicy, slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd');
        const a = cardsService.slotContentService.upsertEntity(cards, { id: 'a' });
        decksService.slotContentService.addBucketMemberSlots(deck, [a]);
        db.flush();
        slotReleasePolicy.slotsWritten = 0;
        const revisionBefore = deck.changedAtRevision;
        decksService.slotContentService.addBucketMemberSlots(deck, [a]);
        expect(decksService.slotContentService.getBucketMemberSlotCount(deck)).toBe(1);
        expect(slotReleasePolicy.slotsWritten).toBe(0);
        expect(deck.changedAtRevision).toBe(revisionBefore);
    });
});
