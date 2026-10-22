import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMBucketCommands } from '../OIMBucketCommands';
import { OIMDB } from '../../../factories/OIMDB';
import { OIM_MAX_COMMANDS_PER_SLOT } from '../../../engine/bucket/commands/constants/OIM_MAX_COMMANDS_PER_SLOT';
import { applyOrderedListCommands, sameEntitySlotSequence } from '../../../../tests/support/orderedListConsumer';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMOrderedListCommand } from '../../../engine/bucket/commands/types/TOIMOrderedListCommand';

type TCard = { id: string };

const FOUR = ['a', 'b', 'c', 'd'];

type TFixture = {
    moveTheHead: () => void;
    endTheFrame: () => void;
    script: () => readonly TOIMOrderedListCommand[];
    wholeListWasAsked: () => boolean;
    drawn: TOIMEntitySlot<TCard>[];
    draw: () => readonly TOIMOrderedListCommand[];
    held: () => TOIMEntitySlot<TCard>[];
};

const aConsumerDrawnUpToTheFrameBeforeItsEdits = (maxCommandsPerSlot?: number): TFixture => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TCard>>({
        bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot }),
    });
    const listService = createOIMBucketService(db, { slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    const bucket = listService.holdSlotByKey(list, 'deck');
    for (const id of FOUR) {
        cardsService.slotContentService.upsertEntity(cards, { id });
        const holdingSlot = cardsService.holdSlotByKey(cards, id);
        holdingSlot.owner.unholdSlot(holdingSlot);
        membersService.insertBucketMemberSlotAt(bucket, membersService.getBucketMemberSlotCount(bucket), holdingSlot);
    }

    const drawn: TOIMEntitySlot<TCard>[] = [];
    const held = (): TOIMEntitySlot<TCard>[] => Array.from(membersService.getBucketMemberSlots(bucket));
    const draw = (): readonly TOIMOrderedListCommand[] => {
        const script = bucket.commands ?? [];
        if (bucket.isWholeListRecorded) {
            drawn.length = 0;
            for (const slot of held()) drawn.push(slot);
            return script;
        }
        applyOrderedListCommands(drawn, script);
        return script;
    };
    draw();
    db.flush();

    return {
        drawn, draw, held,
        script: () => bucket.commands ?? [],
        wholeListWasAsked: () => bucket.isWholeListRecorded,
        moveTheHead: () => void membersService.moveBucketMemberSlotToPosition(bucket, 0, FOUR.length - 1),
        endTheFrame: () => db.flush(),
    };
};

describe('what a consumer that refuses a reset is handed', () => {
    it('states one command per slot as the collapse a consumer who names no policy takes', () => {
        expect(OIM_MAX_COMMANDS_PER_SLOT).toBe(1);
    });

    it('keeps a script of exactly one command per slot, and collapses the command after it', () => {
        const atTheRatio = aConsumerDrawnUpToTheFrameBeforeItsEdits();
        for (let i = 0; i < FOUR.length; i++) atTheRatio.moveTheHead();
        const kept = atTheRatio.script();
        expect(kept).toHaveLength(FOUR.length);
        expect(kept.every(command => command.type === 'move')).toBe(true);
        expect(atTheRatio.wholeListWasAsked()).toBe(false);

        const pastTheRatio = aConsumerDrawnUpToTheFrameBeforeItsEdits();
        for (let i = 0; i < FOUR.length + 1; i++) pastTheRatio.moveTheHead();
        expect(pastTheRatio.script()).toEqual([]);
        expect(pastTheRatio.wholeListWasAsked()).toBe(true);
    });

    it('hands a consumer that refuses resets every move, however far past the list the script grows', () => {
        const { moveTheHead, draw, drawn, held, wholeListWasAsked } =
            aConsumerDrawnUpToTheFrameBeforeItsEdits(Infinity);
        const far = FOUR.length * 5;
        for (let i = 0; i < far; i++) moveTheHead();

        const script = draw();

        expect(script.length).toBe(far);
        expect(wholeListWasAsked()).toBe(false);
        expect(sameEntitySlotSequence(drawn, held())).toBe(true);
    });

    it('keeps refusing frame after frame, and leaves the consumer holding the bucket\'s list', () => {
        const { moveTheHead, endTheFrame, draw, drawn, held, wholeListWasAsked } =
            aConsumerDrawnUpToTheFrameBeforeItsEdits(Infinity);
        for (let frame = 0; frame < 6; frame++) {
            for (let i = 0; i < FOUR.length * 3; i++) moveTheHead();
            draw();
            expect(wholeListWasAsked()).toBe(false);
            expect(sameEntitySlotSequence(drawn, held())).toBe(true);
            endTheFrame();
        }
    });

    it('collapses at half a command per slot for a consumer that asks for half', () => {
        const { moveTheHead, script, wholeListWasAsked } = aConsumerDrawnUpToTheFrameBeforeItsEdits(0.5);
        for (let i = 0; i < FOUR.length / 2 + 1; i++) moveTheHead();
        expect(script()).toEqual([]);
        expect(wholeListWasAsked()).toBe(true);
    });

    it('keeps the script that same consumer asked to keep, one command below its ratio', () => {
        const { moveTheHead, script } = aConsumerDrawnUpToTheFrameBeforeItsEdits(0.5);
        for (let i = 0; i < FOUR.length / 2; i++) moveTheHead();
        expect(script()).toEqual([
            { type: 'move', from: 0, to: 3 },
            { type: 'move', from: 0, to: 3 },
        ]);
    });
});
