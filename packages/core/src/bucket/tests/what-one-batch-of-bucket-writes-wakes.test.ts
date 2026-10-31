import { OIMDB, OIMSlotAtEmptyReleasePolicy, OIMChannelService, OIMSlotContentSetBucketService } from '../../index';
import type { IOIMSlotReleasePolicy, TOIMEntitySlot, TOIMSlot } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { OIMSlotContentPositionalArrayBucketService } from '../OIMSlotContentPositionalArrayBucketService';
import { OIMBucketCommands } from '../OIMBucketCommands';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard>;

class OIMSlotReleasePolicyAtEmptyCounted implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = false;

    public readonly schedulesReleaseOnWrite = true;

    public slotsWritten = 0;

    private readonly slotAtEmptyReleasePolicy = new OIMSlotAtEmptyReleasePolicy();

    public onSlotWritten(): void {
        this.slotsWritten++;
    }

    public onSlotIdle(): boolean { return this.slotAtEmptyReleasePolicy.onSlotIdle(); }

    public onSlotUnheld(): void { return; }

    public isSlotReleasable(): boolean { return this.slotAtEmptyReleasePolicy.isSlotReleasable(); }

    public isEmptySlotReleasable(): boolean { return this.slotAtEmptyReleasePolicy.isEmptySlotReleasable(); }

    public cancelSlotRelease(): void { return; }
}

const createFixture = () => {
    const slotReleasePolicy = new OIMSlotReleasePolicyAtEmptyCounted();
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const pageService = createOIMSlotCollectionService({ slotContentService: new OIMSlotContentPositionalArrayBucketService({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }), slotReleasePolicy });
    const page = pageService.createStoreSlot(db);
    const bucket = pageService.holdSlotByKey(page, 'p');
    const [a, b, c] = ['a', 'b', 'c'].map(id => cardsService.writeSlotContentByKey(cards, id, { id }));
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
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const decksService = createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TCardSlot>(), slotReleasePolicy });
        const decks = decksService.createStoreSlot(db);
        const deck = decksService.holdSlotByKey(decks, 'd');
        const a = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a' });
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
