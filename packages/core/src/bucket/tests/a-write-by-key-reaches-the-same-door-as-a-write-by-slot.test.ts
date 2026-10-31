import { OIMPositionalArrayBucketContentService } from '../OIMPositionalArrayBucketContentService';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { OIMEffectService } from '../../effect/OIMEffectService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMPositionalArrayBucketContentService<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
    const listService = createOIMSlotCollectionService({ slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    const slotOf = (id: string): TCardSlot => {
        cardsService.writeSlotContentByKey(cards, id, { id, title: id });
        return cardsService.getSlotByKey(cards, id);
    };
    const writeContentByKey = (key: string, members: readonly TCardSlot[]): void => {
        const slot = listService.findSlotByKey(list, key);
        if (slot !== undefined) membersService.writeSlotContent(slot, members);
    };
    return { db, membersService, bucket, slotOf, writeContentByKey };
};

describe('a write by key reaches the same door as a write by slot', () => {
    it('wakes the subscriber the write earned', () => {
        const { db, membersService, bucket, slotOf, writeContentByKey } = createFixture();
        const a = slotOf('a');
        const b = slotOf('b');
        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runCount++; }, [bucket]);
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
