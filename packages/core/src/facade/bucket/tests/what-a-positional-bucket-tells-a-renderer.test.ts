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
type TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TCard>>;
type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;
type TMembersService = OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TCard>>;

const held = (membersService: TMembersService, bucket: TBucket): TOIMEntitySlot<TCard>[] =>
    Array.from(membersService.getBucketMemberSlots(bucket));

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TCard>>({ bucketCommands: new OIMBucketCommands({}) });
    const listService = createOIMBucketService(db, { slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    const slotOf = (id: string): TOIMEntitySlot<TCard> => {
        cardsService.slotContentService.upsertEntity(cards, { id, title: id });
        const holdingSlot = cardsService.holdSlotByKey(cards, id);
        holdingSlot.owner.unholdSlot(holdingSlot);
        return holdingSlot;
    };
    const drawn: TOIMEntitySlot<TCard>[] = [];
    let script: readonly TOIMOrderedListCommand[] = [];
    let wholeListWasAsked = false;
    OIMChannelService.INSTANCE.subscribeAfterEachFrame(db.defaultChannelSlot, () => {
        script = (bucket.commands ?? []).slice();
        wholeListWasAsked = bucket.isWholeListRecorded;
        if (wholeListWasAsked) {
            drawn.length = 0;
            for (const slot of membersService.getBucketMemberSlots(bucket)) drawn.push(slot);
            return;
        }
        applyOrderedListCommands(drawn, script);
    });
    const append = (slot: TOIMEntitySlot<TCard>): void => {
        membersService.insertBucketMemberSlotAt(bucket, membersService.getBucketMemberSlotCount(bucket), slot);
    };
    return {
        db, membersService, bucket, slotOf, append, drawn,
        script: () => script,
        wholeListWasAsked: () => wholeListWasAsked,
    };
};

describe('what a positional bucket tells a renderer', () => {
    it('hands back the move the caller made, and not a rebuild', () => {
        const fixture = createFixture();
        for (const id of ['a', 'b', 'c', 'd']) fixture.append(fixture.slotOf(id));
        fixture.db.flush();
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService,fixture.bucket))).toBe(true);

        fixture.membersService.moveBucketMemberSlotToPosition(fixture.bucket, 0, 3);
        fixture.db.flush();

        expect(fixture.script()).toEqual([{ type: 'move', from: 0, to: 3 }]);
        expect(fixture.wholeListWasAsked()).toBe(false);
    });

    it('says nothing at all to a consumer that is already up to date', () => {
        const fixture = createFixture();
        fixture.append(fixture.slotOf('a'));
        fixture.db.flush();
        expect(fixture.script()).toHaveLength(1);

        fixture.db.flush();

        expect(fixture.script()).toEqual([]);
        expect(fixture.wholeListWasAsked()).toBe(false);
    });

    it('keeps the script and the list agreeing after every single write', () => {
        const fixture = createFixture();
        const slots = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => fixture.slotOf(id));

        const steps: [string, () => void][] = [
            ['append six', () => { for (const slot of slots) fixture.append(slot); }],
            ['move 0 → 5', () => void fixture.membersService.moveBucketMemberSlotToPosition(fixture.bucket, 0, 5)],
            ['move 4 → 1', () => void fixture.membersService.moveBucketMemberSlotToPosition(fixture.bucket, 4, 1)],
            ['insert at 2', () => fixture.membersService.insertBucketMemberSlotAt(fixture.bucket, 2, fixture.slotOf('g'))],
            ['remove at 3', () => void fixture.membersService.removeBucketMemberSlotAt(fixture.bucket, 3)],
            ['move range 0,2 → 3', () => { fixture.membersService.moveBucketMemberSlotRangeToPosition(fixture.bucket, 0, 2, 3); }],
            ['remove range 1,2', () => void fixture.membersService.removeBucketMemberSlotRange(fixture.bucket, 1, 2)],
        ];
        for (const [name, step] of steps) {
            step();
            fixture.db.flush();
            const ids = (of: readonly TOIMEntitySlot<TCard>[]): string =>
                of.map(s => s.entity?.id ?? '?').join('');
            expect(`${name}: ${ids(fixture.drawn)}`)
                .toBe(`${name}: ${ids(held(fixture.membersService,fixture.bucket))}`);
            expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService,fixture.bucket))).toBe(true);
        }
    });

    it('collapses a script longer than the list it describes into one whole-list answer', () => {
        const fixture = createFixture();
        for (const id of ['a', 'b', 'c']) fixture.append(fixture.slotOf(id));
        fixture.db.flush();

        for (let i = 0; i < 12; i++) fixture.membersService.moveBucketMemberSlotToPosition(fixture.bucket, 0, 2);
        fixture.db.flush();

        expect(fixture.wholeListWasAsked()).toBe(true);
        expect(fixture.script()).toEqual([]);
        expect(sameEntitySlotSequence(fixture.drawn, held(fixture.membersService,fixture.bucket))).toBe(true);
    });
});
