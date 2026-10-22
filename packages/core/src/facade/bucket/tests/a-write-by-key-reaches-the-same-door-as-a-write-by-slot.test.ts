import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
    const listService = createOIMBucketService(db, { slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    const slotOf = (id: string): TCardSlot => {
        cardsService.slotContentService.upsertEntity(cards, { id, title: id });
        return cardsService.getSlotByKey(cards, id);
    };
    const writeContentByKey = (key: string, members: readonly TCardSlot[]): void => {
        const slot = listService.findSlotByKey(list, key);
        if (slot !== undefined) membersService.writeBucketMemberSlots(slot, members);
    };
    return { db, membersService, bucket, slotOf, writeContentByKey };
};

describe('a write by key reaches the same door as a write by slot', () => {
    it('wakes the subscriber the write earned', () => {
        const { db, membersService, bucket, slotOf, writeContentByKey } = createFixture();
        const a = slotOf('a');
        const b = slotOf('b');
        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, [bucket], [], () => { runCount++; });
        db.flush();
        runCount = 0;

        writeContentByKey('deck', [a, b]);
        db.flush();

        expect(runCount).toBe(1);
        expect(Array.from(membersService.getBucketMemberSlots(bucket)).map(slot => slot.key)).toEqual(['a', 'b']);
    });

    it('records the commands that write earned, in the frame that earned them', () => {
        const { db, bucket, slotOf, writeContentByKey } = createFixture();
        const a = slotOf('a');
        db.flush();
        let wholeListWasAsked = false;
        OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => { wholeListWasAsked = bucket.isWholeListRecorded; });

        writeContentByKey('deck', [a]);
        db.flush();

        expect(wholeListWasAsked).toBe(true);
    });

    it('takes a hold on every slot the write brought in', () => {
        const { db, slotOf, writeContentByKey } = createFixture();
        const a = slotOf('a');
        db.flush();
        const before = a.holdCount;

        writeContentByKey('deck', [a]);
        db.flush();

        expect(a.holdCount).toBe(before + 1);
    });
});
