import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceArrayDriven, createOIMBucketService, createOIMEntityService,
} from '../../../../index';
import { oimOrderedListCommandsOfTransition } from '../utils/oimOrderedListCommandsOfTransition';
import type { TOIMEffect } from '../../../computed/types/TOIMEffect';
import type { TOIMBucketSlot } from '../../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../../entity/types/TOIMEntitySlot';
import type { TOIMOrderedListCommand } from '../types/TOIMOrderedListCommand';
import type { TOIMBucketSlotsArrayStore } from '../../array/types/TOIMBucketSlotsArrayStore';
import { applyOrderedListCommands, sameEntitySlotSequence } from '../../../../../tests/support/orderedListConsumer';

type TCard = { id: string; rank: number; label: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;
type TSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

const byRank = (a: TCardSlot, b: TCardSlot): number => (a.entity?.rank ?? 0) - (b.entity?.rank ?? 0);

function createFixture() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
    const listService = createOIMBucketService<
        TCardSlot, string, TSlots, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
    >(db, { slotContentService: membersService });
    const list = listService.createStoreSlot(db);
    cardsService.slotContentService.upsertEntities(cards, [
        { id: 'c1', rank: 1, label: 'one' },
        { id: 'c2', rank: 2, label: 'two' },
        { id: 'c3', rank: 3, label: 'three' },
    ]);
    db.flush();
    const bucket = listService.holdSlotByKey(list, 'l');
    membersService.writeBucketMemberSlots(bucket, ['c1', 'c2', 'c3'].map(id => cardsService.getSlotByKey(cards, id)));
    db.flush();

    const restateInRankOrder = (): void => {
        membersService.writeBucketMemberSlots(bucket, Array.from(membersService.getBucketMemberSlots(bucket)).sort(byRank));
    };

    const updateByKey = (key: string, patch: Partial<TCard>): void => {
        const slot = cardsService.findSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };

    const deleteByKey = (key: string): void => {
        const slot = cardsService.findSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.deleteEntity(slot);
    };

    return { db, cardsService, cards, membersService, bucket, restateInRankOrder, updateByKey, deleteByKey };
}

/**
 * THE CONSUMER'S HALF, which is the whole of what `createOrderedCommands` was:
 * hold the list last handed out, subscribe to the bucket with one effect, and on
 * every wake read the list again and diff. Nothing here is a mechanism the
 * engine owes — `maxCommandsPerSlot` is the diff's own argument, `dispose` the effect's.
 */
function orderedCommandsOf(
    db: OIMDB,
    membersService: OIMSlotContentBucketServiceArrayDriven<TCardSlot>,
    bucket: TOIMBucketSlot<TSlots, string>,
    maxCommandsPerSlot?: number,
) {
    let prev: TOIMEntitySlot<TCard>[] = Array.from(membersService.getBucketMemberSlots(bucket));
    let commands: TOIMOrderedListCommand[] = [];
    let runCount = 0;
    const effect: TOIMEffect = OIMEffectService.INSTANCE.createEffect(db, [bucket], [], () => {
        runCount++;
        const next = Array.from(membersService.getBucketMemberSlots(bucket));
        commands = oimOrderedListCommandsOfTransition(prev, next, maxCommandsPerSlot);
        prev = next;
    });
    return {
        effect,
        rendered: (): readonly TOIMEntitySlot<TCard>[] => prev,
        commands: (): TOIMOrderedListCommand[] => commands,
        wakes: (): number => runCount,
    };
}

describe('a consumer that diffs the bucket inside its own effect', () => {
    it('yields the same empty array and wakes nobody when the frame left the bucket unchanged', () => {
        const { db, membersService, bucket, updateByKey } = createFixture();
        const stream = orderedCommandsOf(db, membersService, bucket);
        // Born between frames with nothing written behind it, so it is owed
        // nothing and runs no body.
        db.flush();
        const initial = stream.commands();
        expect(initial.length).toBe(0);

        // No write reaches a bucket at all — not `label`, and not `rank`
        // either. A bucket's slots and their order are the caller's, and this frame's
        // caller said nothing.
        updateByKey('c1', { label: 'ONE' });
        db.flush();

        expect(stream.commands()).toBe(initial);
        expect(stream.wakes()).toBe(0);
    });

    it('yields exactly the commands that reproduce the new list for an incremental change', () => {
        const { db, membersService, bucket, restateInRankOrder, updateByKey } = createFixture();
        const stream = orderedCommandsOf(db, membersService, bucket);
        db.flush();
        const rendered = Array.from(stream.rendered());

        updateByKey('c1', { rank: 99 });
        restateInRankOrder();
        db.flush();

        const applied = applyOrderedListCommands(rendered.slice(), stream.commands());
        expect(sameEntitySlotSequence(applied, Array.from(membersService.getBucketMemberSlots(bucket)))).toBe(true);
        // A single card's rank change with no other reordering is exactly one move.
        expect(stream.commands().length).toBe(1);
        expect(stream.commands()[0].type).toBe('move');
    });

    it('emits a single reset when maxCommandsPerSlot is crossed by a wholesale change', () => {
        const { db, cardsService, cards, membersService, bucket, deleteByKey } = createFixture();
        const impatient = orderedCommandsOf(db, membersService, bucket, 0.5);
        db.flush();

        for (const id of ['c1', 'c2', 'c3']) deleteByKey(id);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c4', rank: 4, label: 'four' },
            { id: 'c5', rank: 5, label: 'five' },
            { id: 'c6', rank: 6, label: 'six' },
        ]);
        // The list is what the caller says it is: three cards out, three in.
        membersService.writeBucketMemberSlots(bucket, ['c4', 'c5', 'c6'].map(id => cardsService.getSlotByKey(cards, id)));
        db.flush();

        const commands = impatient.commands();
        expect(commands.length).toBe(1);
        expect(commands[0].type).toBe('reset');
    });

    it('stays incremental for a small change under the same maxCommandsPerSlot threshold', () => {
        const { db, membersService, bucket, restateInRankOrder, updateByKey } = createFixture();
        const impatient = orderedCommandsOf(db, membersService, bucket, 0.5);
        db.flush();

        updateByKey('c1', { rank: 50 });
        restateInRankOrder();
        db.flush();

        const commands = impatient.commands();
        expect(commands.length).toBe(1);
        expect(commands[0].type).toBe('move');
    });

    it('still diffs a wholesale change when no maxCommandsPerSlot is given', () => {
        const { db, cardsService, cards, membersService, bucket, deleteByKey } = createFixture();
        const patient = orderedCommandsOf(db, membersService, bucket);
        db.flush();

        for (const id of ['c1', 'c2', 'c3']) deleteByKey(id);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c4', rank: 4, label: 'four' },
            { id: 'c5', rank: 5, label: 'five' },
            { id: 'c6', rank: 6, label: 'six' },
        ]);
        membersService.writeBucketMemberSlots(bucket, ['c4', 'c5', 'c6'].map(id => cardsService.getSlotByKey(cards, id)));
        db.flush();

        const commands = patient.commands();
        expect(commands.some(c => c.type === 'reset')).toBe(false);
        expect(commands.length).toBe(6); // 3 removals + 3 inserts
    });

    /**
     * WHAT THIS CASE WAS: three assertions about the stream OBJECT — that
     * `getValue()` answered `[]` before anything moved, that
     * `typeof commands.slot === 'object'`, and that `typeof commands.detach ===
     * 'function'`. Two of them have nothing left to be asked of: there is no
     * observable and no published identity, only a consumer's own last list and
     * its own effect, both ordinary values in its own closure.
     *
     * THE THIRD IS THE PROPERTY THAT MATTERED and it is asked below, of the
     * effect: what `dispose` promises is SILENCE, and that is what is asserted.
     * What a detached consumer's last script says afterwards was never promised
     * — pinning it would make the current choice load-bearing for whoever
     * changed it — so it is not pinned here either.
     */
    it('stops on detach, and what it stops is the waking', () => {
        const { db, membersService, bucket, restateInRankOrder, updateByKey } = createFixture();
        const stream = orderedCommandsOf(db, membersService, bucket);
        db.flush();
        expect(stream.commands().length).toBe(0);
        expect(stream.effect.effectService).toBe(OIMEffectService.INSTANCE);

        updateByKey('c1', { rank: 99 });
        restateInRankOrder();
        db.flush();
        expect(stream.wakes()).toBe(1);
        expect(stream.commands().length).toBeGreaterThan(0);

        OIMEffectService.INSTANCE.disposeEffect(stream.effect);

        updateByKey('c3', { rank: -1 });
        restateInRankOrder();
        db.flush();
        expect(stream.wakes()).toBe(1);
    });
});
