import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMEffectService } from '../OIMEffectService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TCard = { id: string; rank: number; title: string };

function createFixture() {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    for (const id of ['a', 'b', 'c']) cardsService.slotContentService.upsertEntity(cards, { id, rank: 0, title: 't' });
    db.flush();
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.findSlotByKey(cards, id);
        if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
    };
    return { db, effectService, cardsService, cards, updateCard };
}

/** The slot of a key that certainly has one — every setup key does. */
const slotOf = (
    cardsService: ReturnType<typeof createFixture>['cardsService'],
    cards: ReturnType<typeof createFixture>['cards'],
    id: string,
): TOIMEntitySlot<TCard, TOIMStoreKey> => cardsService.getSlotByKey(cards, id);

/**
 * The column identities a batch-of-columns effect reads.
 *
 * `effectService.createEffect` mints one column inside one subscription; a batch
 * over several columns of one slot resolves them through the collection's own
 * column service and builds ONE effect over the lot.
 */
const columnsOf = (
    cardsService: ReturnType<typeof createFixture>['cardsService'],
    slot: TOIMEntitySlot<TCard, TOIMStoreKey>,
    names: readonly (keyof TCard & string)[],
): TOIMSlot[] => names.map((name) => cardsService.getColumn(slot, name));

describe('one effect over many slots', () => {
    it('wakes once however many of its slots moved', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        let woken = 0;
        effectService.createEffect(db, ['a', 'b', 'c'].map((id) => slotOf(cardsService, cards,id)), [], () => { woken++; });
        updateCard('a', { rank: 1 });
        updateCard('b', { rank: 1 });
        updateCard('c', { rank: 1 });
        db.flush();
        expect(woken).toBe(1);
    });

    it('separate effects are still separate calls — this is the thing it fixes', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        let woken = 0;
        const body = (): void => { woken++; };
        for (const id of ['a', 'b', 'c']) effectService.createEffect(db, [slotOf(cardsService, cards,id)], [], body);
        updateCard('a', { rank: 1 });
        updateCard('b', { rank: 1 });
        db.flush();
        expect(woken).toBe(2);
    });

    it('wakes again in the next frame', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        let woken = 0;
        effectService.createEffect(db, ['a', 'b'].map((id) => slotOf(cardsService, cards,id)), [], () => { woken++; });
        updateCard('a', { rank: 1 });
        db.flush();
        updateCard('b', { rank: 2 });
        db.flush();
        expect(woken).toBe(2);
    });

    it('one detach takes the effect out of every slot it was registered in', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        let woken = 0;
        const effect = effectService.createEffect(db, ['a', 'b'].map((id) => slotOf(cardsService, cards,id)), [], () => { woken++; });
        effectService.disposeEffect(effect);
        updateCard('a', { rank: 1 });
        updateCard('b', { rank: 1 });
        db.flush();
        expect(woken).toBe(0);
    });

    it('two effects sharing a body each get their own call', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        let woken = 0;
        const body = (): void => { woken++; };
        effectService.createEffect(db, [slotOf(cardsService, cards,'a')], [], body);
        effectService.createEffect(db, [slotOf(cardsService, cards,'b')], [], body);
        updateCard('a', { rank: 1 });
        updateCard('b', { rank: 1 });
        db.flush();
        expect(woken).toBe(2);
    });
});

describe('one effect over many columns of one slot', () => {
    it('wakes once when several of the named columns moved together', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        const slot = slotOf(cardsService, cards,'a');
        let woken = 0;
        effectService.createEffect(db, columnsOf(cardsService,slot, ['rank', 'title']), [], () => { woken++; });
        updateCard('a', { rank: 1, title: 'x' });
        db.flush();
        expect(woken).toBe(1);
    });

    it('stays asleep for a column it did not name', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        const slot = slotOf(cardsService, cards,'a');
        let woken = 0;
        effectService.createEffect(db, columnsOf(cardsService,slot, ['rank']), [], () => { woken++; });
        updateCard('a', { title: 'x' });
        db.flush();
        expect(woken).toBe(0);
    });

    it('one effect per column is what it replaces', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        let woken = 0;
        const slot = slotOf(cardsService, cards,'a');
        effectService.createEffect(db, [cardsService.getColumn(slot, 'rank')], [], () => { woken++; });
        effectService.createEffect(db, [cardsService.getColumn(slot, 'title')], [], () => { woken++; });
        updateCard('a', { rank: 1, title: 'x' });
        db.flush();
        expect(woken).toBe(2);
    });
});

describe('which columns moved in the frame being delivered', () => {
    it('runs the body of every column that moved, and only those', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        const slot = slotOf(cardsService, cards,'a');
        const ran: string[] = [];
        for (const name of ['rank', 'title'] as const) {
            effectService.createEffect(
                db, [cardsService.getColumn(slot, name)], [], () => { ran.push(name); });
        }
        updateCard('a', { rank: 1, title: 'x' });
        db.flush();
        expect(ran.slice().sort()).toEqual(['rank', 'title']);
    });

    /**
     * The named case, asked so that it can only be answered by the named
     * mechanism: a DIFFERENT slot moves, and the reading is taken from inside
     * the delivery of the frame that slot moved in — the only moment at which a
     * per-slot answer had anything to be wrong about.
     *
     * The slot that stays put is armed by a column subscription of its own,
     * because an unwatched slot mints no column identity at all and its silence
     * would prove nothing about the frame.
     */
    it('leaves the columns of a slot that did not move alone', () => {
        const { db, effectService, cardsService, cards, updateCard } = createFixture();
        const still = slotOf(cardsService, cards,'a');
        const moving = slotOf(cardsService, cards,'b');

        let stillRan = 0;
        effectService.createEffect(db, [cardsService.getColumn(still, 'rank')], [], () => { stillRan++; });

        let movingRan = 0;
        effectService.createEffect(db, [cardsService.getColumn(moving, 'rank')], [], () => { movingRan++; });

        updateCard('b', { rank: 1 });
        db.flush();

        // The slot that DID move names its column, taken in the same breath as
        // the silence above — so the zero is this frame's answer for THAT slot
        // and not a recorder that was switched off.
        expect(movingRan).toBe(1);
        expect(stillRan).toBe(0);
    });
});
