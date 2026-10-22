import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TCard = { id: TOIMStoreKey };

/**
 * WHAT A `Map` WOULD SAY — the oracle, and it is the container itself.
 *
 * A one-entry `Map` filed under `had` and asked about `next` IS SameValueZero,
 * by specification, with nothing restated. Using a `Map` here rather than
 * spelling the rule out a second time is the whole point of the file: the thing
 * `oimSameValueZeroGuard` claims to agree with is the thing it is compared against.
 */
const mapSays = (had: TOIMStoreKey, next: TOIMStoreKey): boolean => new Map<TOIMStoreKey, number>([[had, 1]]).has(next);

/**
 * Every value the two candidate rules could possibly separate, plus enough
 * ordinary ones that a rule which answered "true" to everything fails.
 *
 * `NaN` is where `===` parts company with a `Map`; `-0` and `0` are where
 * `Object.is` does. The rest are here so the table is a real table: two numbers
 * that are not each other, two strings, and a number against the string that
 * prints the same way.
 */
const VALUES: readonly { label: string; value: TOIMStoreKey }[] = [
    { label: 'NaN', value: Number.NaN },
    { label: '0', value: 0 },
    { label: '-0', value: -0 },
    { label: '1', value: 1 },
    { label: 'Infinity', value: Number.POSITIVE_INFINITY },
    { label: '-Infinity', value: Number.NEGATIVE_INFINITY },
    { label: '""', value: '' },
    { label: '"0"', value: '0' },
    { label: '"spades"', value: 'spades' },
];

/** Every ordered pair, so an asymmetric rule cannot hide behind a symmetric table. */
const disagreements = (rule: (had: TOIMStoreKey, next: TOIMStoreKey) => boolean): string[] => {
    const found: string[] = [];
    for (const had of VALUES) {
        for (const next of VALUES) {
            if (rule(had.value, next.value) === mapSays(had.value, next.value)) continue;
            found.push(`${had.label} / ${next.label}`);
        }
    }
    return found;
};

/**
 * A collection keyed by a scalar, which is the one shape the map-driven store
 * exists for. No channel and no layer: nothing here is delivered, and the
 * question is where an identity is filed.
 */
const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    return { cardsService, cards: cardsService.createStoreSlot(db) };
};

describe('the same key, and what a map would say', () => {
    /**
     * THE EQUIVALENCE. If this holds, the third rule is not a second opinion —
     * it is the container's own answer reached without the container.
     */
    it('answers every pair the way the map that files the identities does', () => {
        expect(disagreements(oimSameValueZeroGuard)).toEqual([]);
    });

    /**
     * AND IT IS NOT `===`, at exactly one value, which is the defect that
     * shipped. `NaN` is not written on purpose — it is `Number(undefined)`, or
     * `Date.parse` on a string a server sent.
     */
    it('is not strict equality, and names where the two part', () => {
        expect(disagreements((had, next) => had === next)).toEqual(['NaN / NaN']);
    });

    /**
     * AND IT IS NOT `Object.is`, at a different value. `Object.is` separates
     * `-0` from `0` where a `Map` unifies them, so adopting it would trade this
     * defect for the same one somewhere else — which is what the two entries
     * above and below, taken together, say.
     */
    it('is not Object.is, and names where those two part', () => {
        expect(disagreements((had, next) => Object.is(had, next))).toEqual(['0 / -0', '-0 / 0']);
    });
});

describe('the container answering, at the values a hand-written rule gets wrong', () => {
    it('resolves one identity at a key that is not equal to itself', () => {
        const { cardsService, cards } = createFixture();
        const firstSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        // The same key, handed in again, is the same identity and no second
        // mint — which is what the memo was an optimisation OF.
        const secondSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        expect(secondSlot).toBe(firstSlot);
        // And the read agrees with the door.
        expect(cardsService.getSlotByKey(cards,Number.NaN)).toBe(firstSlot);
        expect(cardsService.getSlotCount(cards)).toBe(1);

        firstSlot.owner.unholdSlot(firstSlot);
        secondSlot.owner.unholdSlot(secondSlot);
    });

    /**
     * The pair of keys the deleted memo held one cell for: a second key in
     * between must not cost the first its identity.
     */
    it('gives the same identity back after another key has been resolved in between', () => {
        const { cardsService, cards } = createFixture();
        const firstSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        cardsService.holdSlotByKey(cards,'spades');
        const otherSlot = cardsService.getSlotByKey(cards,'spades')!;
        expect(otherSlot).not.toBe(firstSlot);
        expect(cardsService.holdSlotByKey(cards,Number.NaN)).toBe(firstSlot);
        expect(cardsService.getSlotCount(cards)).toBe(2);
    });

    /**
     * `-0` and `0` are ONE key, because they are one key to the `Map`. A store
     * that used `Object.is` would mint two identities here and write values into
     * whichever one the last write resolved.
     */
    it('treats a negative zero and a zero as one key', () => {
        const { cardsService, cards } = createFixture();
        const firstSlot = cardsService.holdSlotByKey(cards,-0);
        expect(cardsService.holdSlotByKey(cards,0)).toBe(firstSlot);
        expect(cardsService.getSlotByKey(cards,0)).toBe(firstSlot);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    /**
     * AND THE WRITE DOOR AGREES WITH THE HOLD DOOR, which is the half the store
     * tests could not reach: a bucket store had no value to put anywhere. An
     * entity written under `NaN` lands in the identity a hold resolved, rather
     * than in a second one nothing can find again.
     */
    it('writes into the identity a hold already resolved at that key', () => {
        const { cardsService, cards } = createFixture();
        const heldSlot = cardsService.holdSlotByKey(cards,Number.NaN);
        const written = cardsService.slotContentService.upsertEntity(cards, { id: Number.NaN });

        expect(written).toBe(heldSlot);
        expect(cardsService.getSlotCount(cards)).toBe(1);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});
