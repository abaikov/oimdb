import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { OIMChannelQueue } from '../OIMChannelQueue';
import type { TOIMChannelSlot } from '../types/TOIMChannelSlot';
import type { TOIMEffect } from '../../computed/types/TOIMEffect';
import { OIMEffectService } from '../../computed/OIMEffectService';

type Card = { id: string; n: number };

const updateEntityByKey = (
    cardsService: ReturnType<typeof createOIMEntityService<Card>>,
    cards: ReturnType<ReturnType<typeof createOIMEntityService<Card>>['createStoreSlot']>,
    key: string, patch: Partial<Card>,
): void => {
    const slot = cardsService.findSlotByKey(cards, key);
    if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
};

/**
 * The frame's list of leaves, which is private and is read here on purpose: an
 * array made and thrown away between two frames would never appear on any
 * public field, so a probe that watched only what the class publishes could
 * report "one array" about a design that allocated one a frame.
 */
const effectChannelQueueOf = (channelSlot: TOIMChannelSlot): OIMChannelQueue<TOIMEffect> => channelSlot.effectChannelQueue;

const leavesHeldBy = (channelSlot: TOIMChannelSlot): readonly (TOIMEffect | undefined)[] =>
    (effectChannelQueueOf(channelSlot) as unknown as { entries: (TOIMEffect | undefined)[] }).entries;

const leafCountOf = (channelSlot: TOIMChannelSlot): number => effectChannelQueueOf(channelSlot).getEntryCount();

/**
 * A collection of `size` cards, one effect per slot, settled and quiet.
 *
 * THE SECOND FLUSH IS NOT DECORATION. An effect born between frames inherits
 * whatever the OPEN batch has already written to its roots — the writes above
 * are behind a flush, so these effects inherit nothing and that flush runs
 * none of them. A count of arrays must not depend on which way that went: the
 * flush absorbs whatever the births owed, and every observation this file makes
 * is taken after it.
 */
const subscribedCards = (size: number) => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    for (let i = 0; i < size; i++) cardsService.slotContentService.upsertEntity(cards, { id: `c${i}`, n: 0 });
    db.flush();

    let runCount = 0;
    const effects: TOIMEffect[] = [];
    for (let i = 0; i < size; i++) {
        effects.push(effectService.createEffect(db, [cardsService.getSlotByKey(cards, `c${i}`)!], [], () => { runCount++; }));
    }
    db.flush();
    runCount = 0;

    /** Every distinct array that has ever held the frame's list, by identity. */
    const seen = new Set<readonly (TOIMEffect | undefined)[]>();
    const observe = (): void => { seen.add(leavesHeldBy(db.defaultChannelSlot)); };
    // The one the channel is holding once it is quiet.
    observe();

    return { db, cardsService, cards, effects, seen, observe, runCount: () => runCount };
};

/**
 * THE DESIGN THAT WAS REFUSED, as a working list rather than a sketch: the
 * frame's list copied so it can be emptied and refilled underneath the walk.
 *
 * Only what the claim counts is modelled — the take. Enlisting is identical on
 * both designs and would be the same code twice.
 */
class CopyingQueue {
    /** The list, made once and refilled — one array for the life of it. */
    private readonly pending: TOIMEffect[] = [];
    /** Every array this design brings into existence, the list included. */
    public arrays = 1;
    /** Every reference written into the frame's list. Reusing one writes none. */
    public elementWrites = 0;

    public queue(leaf: TOIMEffect): void {
        this.pending.push(leaf);
    }

    /** One allocation and `pending.length` element writes, whatever it holds. */
    public takeForDelivery(): readonly TOIMEffect[] {
        const walking = Array.from(this.pending);
        this.arrays++;
        this.elementWrites += this.pending.length;
        this.pending.length = 0;
        return walking;
    }
}

describe('how many arrays a frame of effects costs', () => {
    /**
     * ONE ARRAY, at every frame, for the life of the channel. Fifty frames
     * rather than two, because a design that allocated per frame and happened to
     * reuse the same address twice would satisfy a two-frame run.
     */
    it('runs 50 frames of 64 effects out of exactly one array', () => {
        const frames = 50;
        const enlisted = 64;
        const { db, cardsService, cards, effects, seen, observe, runCount } = subscribedCards(enlisted);

        for (let frame = 0; frame < frames; frame++) {
            for (let i = 0; i < enlisted; i++) updateEntityByKey(cardsService, cards, `c${i}`, { n: frame + 1 });
            // The list really does hold one leaf per slot that moved: without
            // this the assertion below could be satisfied by a frame that
            // enlisted nothing.
            expect(leafCountOf(db.defaultChannelSlot)).toBe(enlisted);
            db.flush();
            observe();
        }

        // 50 frames × 64 effects = 3 200 runs, out of one array.
        expect(runCount()).toBe(frames * enlisted);
        expect(seen.size).toBe(1);

        // And what the refused design owes for the identical run: the list it
        // starts with plus one array per flush — 1 + 50 = 51 — and one reference
        // copied per enlisted effect, 50 × 64 = 3 200. Emptying in place writes
        // none of those.
        const model = new CopyingQueue();
        let walked = 0;
        for (let frame = 0; frame < frames; frame++) {
            for (let i = 0; i < enlisted; i++) model.queue(effects[i]);
            walked += model.takeForDelivery().length;
        }
        expect(model.arrays).toBe(51);
        expect(model.elementWrites).toBe(3200);
        // Not a straw man: the copy really is the frame's whole list.
        expect(walked).toBe(frames * enlisted);
    });

    /**
     * THE EMPTY FRAME, which is the case that separates the two designs most
     * sharply and the one a ratio flatters least. `flush()` runs a frame
     * whatever is enlisted, so the copy design allocates for a frame that runs
     * nothing; emptying in place touches one length field.
     */
    it('runs 50 empty frames out of the same one array', () => {
        const frames = 50;
        const { db, seen, observe, runCount } = subscribedCards(1);

        for (let frame = 0; frame < frames; frame++) {
            expect(leafCountOf(db.defaultChannelSlot)).toBe(0);
            db.flush();
            observe();
        }

        expect(runCount()).toBe(0);
        expect(seen.size).toBe(1);

        // 1 + 50 = 51 arrays for 0 runs, and no element writes on either design
        // — which is what makes the allocation the whole of the difference here.
        const model = new CopyingQueue();
        for (let frame = 0; frame < frames; frame++) model.takeForDelivery();
        expect(model.arrays).toBe(51);
        expect(model.elementWrites).toBe(0);
    });

    it.each<[number]>([
        [4096],
        [4097],
    ])('holds %i effects in one frame and comes out of it holding one array', (enlisted) => {
        const { db, cardsService, cards, seen, observe, runCount } = subscribedCards(enlisted);

        for (let i = 0; i < enlisted; i++) updateEntityByKey(cardsService, cards, `c${i}`, { n: 1 });
        expect(leafCountOf(db.defaultChannelSlot)).toBe(enlisted);
        db.flush();
        observe();

        expect(runCount()).toBe(enlisted);
        expect(seen.size).toBe(1);

        // The frames AFTER it: neither may bring an array of its own either.
        for (let frame = 0; frame < 4; frame++) {
            updateEntityByKey(cardsService, cards, 'c0', { n: frame + 2 });
            db.flush();
            observe();
        }
        expect(seen.size).toBe(1);
        expect(runCount()).toBe(enlisted + 4);
    });
});
