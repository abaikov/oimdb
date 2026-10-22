import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMChannelService } from '../../../engine/channel/OIMChannelService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { applyOrderedListCommands, sameEntitySlotSequence } from '../../../../tests/support/orderedListConsumer';
import type { TOIMBucketSlot } from '../../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';
import type { TOIMOrderedListCommand } from '../../../engine/bucket/commands/types/TOIMOrderedListCommand';
import type { TOIMBucketSlotsArrayStore } from '../../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;
type TMembersService = OIMSlotContentBucketServiceArrayDriven<TCardSlot>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
    const listService = createOIMBucketService(db, { slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    const slotOf = (id: string): TOIMEntitySlot<TCard> => {
        cardsService.slotContentService.upsertEntity(cards, { id, title: id });
        const holdingSlot = cardsService.holdSlotByKey(cards, id);
        holdingSlot.owner.unholdSlot(holdingSlot);
        return holdingSlot;
    };
    return { db, membersService, list, bucket, slotOf };
};

const held = (membersService: TMembersService, bucket: TBucket): TOIMEntitySlot<TCard>[] =>
    Array.from(membersService.getBucketMemberSlots(bucket));

const ids = (of: readonly TOIMEntitySlot<TCard>[]): string =>
    of.map(s => s.entity?.id ?? '?').join('');

const append = (membersService: TMembersService, bucket: TBucket, slot: TOIMEntitySlot<TCard>): void => {
    membersService.insertBucketMemberSlotAt(bucket, membersService.getBucketMemberSlotCount(bucket), slot);
};

const consumerOver = (built: ReturnType<typeof createFixture>) => {
    const drawn: TOIMEntitySlot<TCard>[] = [];
    let script: readonly TOIMOrderedListCommand[] = [];
    let wholeListWasAsked = false;
    OIMChannelService.INSTANCE.subscribeAfterEachFrame(built.db.defaultChannelSlot, () => {
        script = (built.bucket.commands ?? []).slice();
        wholeListWasAsked = built.bucket.isWholeListRecorded;
        if (wholeListWasAsked) {
            drawn.length = 0;
            for (const slot of built.membersService.getBucketMemberSlots(built.bucket)) drawn.push(slot);
            return;
        }
        applyOrderedListCommands(drawn, script);
    });
    return { drawn, script: () => script, wholeListWasAsked: () => wholeListWasAsked };
};

const drawnList = () => {
    const built = createFixture();
    const consumer = consumerOver(built);
    for (const id of ['a', 'b', 'c', 'd']) append(built.membersService, built.bucket, built.slotOf(id));
    built.db.flush();
    expect(ids(consumer.drawn)).toBe('abcd');
    return { ...built, ...consumer };
};

describe('every wake carries the commands that earned it', () => {
    it('says the list was emptied, and does not hand back a stale placement instead', () => {
        const fixture = drawnList();

        fixture.membersService.moveBucketMemberSlotToPosition(fixture.bucket, 0, 3);
        fixture.membersService.clearBucketMemberSlots(fixture.bucket);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(true);
        expect(fixture.script()).toEqual([]);
        expect(ids(fixture.drawn)).toBe('');
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService, fixture.bucket))).toBe(true);
    });

    it('does not tell a consumer it is up to date with a list that has been cleared', () => {
        const fixture = drawnList();

        fixture.membersService.clearBucketMemberSlots(fixture.bucket);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(true);
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService, fixture.bucket))).toBe(true);
    });

    it('says what a whole bucket written at once left the list holding', () => {
        const fixture = drawnList();
        const next = ['e', 'a', 'f'].map(id => fixture.slotOf(id));

        fixture.membersService.writeBucketMemberSlots(fixture.bucket, next);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(true);
        expect(ids(fixture.drawn)).toBe('eaf');
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService, fixture.bucket))).toBe(true);
    });

    it('leaves the script alone for a door that reports nothing', () => {
        const fixture = drawnList();

        fixture.membersService.clearBucketMemberSlots(fixture.bucket);
        fixture.db.flush();

        fixture.membersService.clearBucketMemberSlots(fixture.bucket);
        fixture.membersService.writeBucketMemberSlots(fixture.bucket, []);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(false);
        expect(fixture.script()).toEqual([]);
    });

    it('keeps the script and the list agreeing across the whole-bucket doors', () => {
        const built = createFixture();
        const consumer = consumerOver(built);
        const { db, membersService, bucket, slotOf } = built;
        const abcd = ['a', 'b', 'c', 'd'].map(id => slotOf(id));

        const steps: [string, () => void][] = [
            ['writeBucketMemberSlots abcd', () => membersService.writeBucketMemberSlots(bucket, abcd)],
            ['moveBucketMemberSlotToPosition 0 → 3', () => void membersService.moveBucketMemberSlotToPosition(bucket, 0, 3)],
            ['clearBucketMemberSlots', () => membersService.clearBucketMemberSlots(bucket)],
            ['writeBucketMemberSlots abcd again', () => membersService.writeBucketMemberSlots(bucket, abcd)],
            ['insertBucketMemberSlotAt the end: e', () => append(membersService, bucket, slotOf('e'))],
            ['moveBucketMemberSlotToPosition then clearBucketMemberSlots', () => {
                membersService.moveBucketMemberSlotToPosition(bucket, 4, 0);
                membersService.clearBucketMemberSlots(bucket);
            }],
            ['writeBucketMemberSlots then removeBucketMemberSlotAt', () => {
                membersService.writeBucketMemberSlots(bucket, abcd);
                membersService.removeBucketMemberSlotAt(bucket, 1);
            }],
        ];
        for (const [name, step] of steps) {
            step();
            db.flush();
            expect(`${name}: ${ids(consumer.drawn)}`)
                .toBe(`${name}: ${ids(held(membersService, bucket))}`);
            expect(sameEntitySlotSequence(consumer.drawn, held(membersService, bucket))).toBe(true);
        }
    });
});
