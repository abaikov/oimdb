
import { oimSameSlotSequence } from '../../bucket/utils/oimSameSlotSequence';
import { oimSameKeySequence } from '../utils/oimSameKeySequence';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { createOIMStoreSlot } from '../../slot/utils/createOIMStoreSlot';
import { OIMDB } from '../../db/OIMDB';
import { TestSlotOwner } from '../../../tests/support/TestSlotOwner';

const testStoreSlot = createOIMStoreSlot(undefined, new OIMDB().defaultChannelSlot, undefined);

const slot = (id: string): TOIMSlot =>
    createOIMEntitySlot<{ id: string }, string>(id, new TestSlotOwner(), testStoreSlot) as TOIMSlot;

describe('a composite key is the same key when it names the same identities in the same order', () => {
    it('answers yes for a rebuilt list of the same identities', () => {
        const a = slot('a');
        const b = slot('b');
        // TWO ARRAYS, one answer: a composite key is a list of identities, and
        // "the same identity" is `===` and never a deep compare.
        expect(oimSameSlotSequence([a, b], [a, b])).toBe(true);
    });

    it('answers no when the order differs', () => {
        const a = slot('a');
        const b = slot('b');
        // ORDER IS PART OF THE KEY. `[deck, day]` and `[day, deck]` are two
        // addresses, and a tree that reached the same node for both would hand
        // one group's slots to the other.
        expect(oimSameSlotSequence([a, b], [b, a])).toBe(false);
    });

    it('answers no when one is a prefix of the other', () => {
        const a = slot('a');
        const b = slot('b');
        expect(oimSameSlotSequence([a], [a, b])).toBe(false);
        expect(oimSameSlotSequence([a, b], [a])).toBe(false);
    });

    it('answers yes for two empty lists', () => {
        expect(oimSameSlotSequence([], [])).toBe(true);
    });

    it('answers no for two identities that merely look alike', () => {
        // Same shape, same content, two identities — and the composite key is
        // built out of identities, so these are two different keys.
        expect(oimSameSlotSequence([slot('a')], [slot('a')])).toBe(false);
    });
});

describe('a list of keys is the same list when every key is the same key, in order', () => {
    it('answers yes for a rebuilt list of the same keys', () => {
        expect(oimSameKeySequence([1, 2, 3], [1, 2, 3])).toBe(true);
    });

    it('answers no when the order differs', () => {
        expect(oimSameKeySequence([1, 2, 3], [1, 3, 2])).toBe(false);
    });

    it('answers no when one is a prefix of the other', () => {
        expect(oimSameKeySequence(['a'], ['a', 'b'])).toBe(false);
    });

    it('answers yes for two empty lists', () => {
        expect(oimSameKeySequence([], [])).toBe(true);
    });

    it('answers yes for NaN and for the two zeroes, the way a Map files them', () => {
        expect(oimSameKeySequence([Number.NaN], [Number.NaN])).toBe(true);
        expect(oimSameKeySequence([0], [-0])).toBe(true);
    });
});
