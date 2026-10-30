import { OIMSlotContentPositionalArrayBucketService } from '../OIMSlotContentPositionalArrayBucketService';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../db/OIMDB';
import { OIMChannelService } from '../../channel/OIMChannelService';
import { applyOrderedListCommands, sameEntitySlotSequence } from '../../../tests/support/orderedListConsumer';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMOrderedListCommand } from '../commands/types/TOIMOrderedListCommand';
import type { TOIMBucketSlotsArrayStore } from '../array/types/TOIMBucketSlotsArrayStore';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;
type TMembersService = OIMSlotContentPositionalArrayBucketService<TCardSlot>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketCommands: new OIMBucketCommands({}) });
    const listService = createOIMSlotCollectionService(db, { slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    const slotOf = (id: string): TOIMEntitySlot<TCard> => {
        cardsService.writeSlotContentByKey(cards, id, { id, title: id });
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
        fixture.membersService.clearSlotContent(fixture.bucket);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(true);
        expect(fixture.script()).toEqual([]);
        expect(ids(fixture.drawn)).toBe('');
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService, fixture.bucket))).toBe(true);
    });

    it('does not tell a consumer it is up to date with a list that has been cleared', () => {
        const fixture = drawnList();

        fixture.membersService.clearSlotContent(fixture.bucket);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(true);
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService, fixture.bucket))).toBe(true);
    });

    it('says what a whole bucket written at once left the list holding', () => {
        const fixture = drawnList();
        const next = ['e', 'a', 'f'].map(id => fixture.slotOf(id));

        fixture.membersService.writeSlotContent(fixture.bucket, next);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(true);
        expect(ids(fixture.drawn)).toBe('eaf');
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService, fixture.bucket))).toBe(true);
    });

    it('leaves the script alone for a door that reports nothing', () => {
        const fixture = drawnList();

        fixture.membersService.clearSlotContent(fixture.bucket);
        fixture.db.flush();

        fixture.membersService.clearSlotContent(fixture.bucket);
        fixture.membersService.writeSlotContent(fixture.bucket, []);
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
            ['writeBucketMemberSlots abcd', () => membersService.writeSlotContent(bucket, abcd)],
            ['moveBucketMemberSlotToPosition 0 → 3', () => void membersService.moveBucketMemberSlotToPosition(bucket, 0, 3)],
            ['clearBucketMemberSlots', () => membersService.clearSlotContent(bucket)],
            ['writeBucketMemberSlots abcd again', () => membersService.writeSlotContent(bucket, abcd)],
            ['insertBucketMemberSlotAt the end: e', () => append(membersService, bucket, slotOf('e'))],
            ['moveBucketMemberSlotToPosition then clearBucketMemberSlots', () => {
                membersService.moveBucketMemberSlotToPosition(bucket, 4, 0);
                membersService.clearSlotContent(bucket);
            }],
            ['writeBucketMemberSlots then removeBucketMemberSlotAt', () => {
                membersService.writeSlotContent(bucket, abcd);
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
