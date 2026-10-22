
import { OIMSlotOwner } from '../../slot/OIMSlotOwner';
import { oimSameSlotSequence } from '../../bucket/utils/oimSameSlotSequence';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimSameKeySequence } from '../utils/oimSameKeySequence';
import { createOIMEntitySlot } from '../../entity/utils/createOIMEntitySlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

const slot = (id: string): TOIMSlot =>
    createOIMEntitySlot<{ id: string }, string>(id, new OIMSlotOwner()) as TOIMSlot;

describe('a scalar key is the same key when a Map would say so', () => {
    it('answers yes for two of the same value', () => {
        expect(oimSameValueZeroGuard('a', 'a')).toBe(true);
        expect(oimSameValueZeroGuard(7, 7)).toBe(true);
    });

    it('answers no across values and across types', () => {
        expect(oimSameValueZeroGuard('a', 'b')).toBe(false);
        // '7' and 7 are two keys in a `Map`, and this must agree with the store
        // it is comparing keys for.
        expect(oimSameValueZeroGuard('7', 7)).toBe(false);
    });

    it('answers YES for NaN against NaN, where `===` says no', () => {
        // THE WHOLE REASON THIS FUNCTION EXISTS. A `Map` files a value at `NaN`
        // and hands it back for `NaN`, so a `held` that used `===` would
        // report "a different key" for the key the store has just resolved — and
        // a slot filed under a key a caller failed to produce was deleted in the
        // frame it was written. `prev !== prev` is what asks "is this NaN"
        // without naming it.
        expect(oimSameValueZeroGuard(Number.NaN, Number.NaN)).toBe(true);
    });

    it('answers no when there was no previous key at all', () => {
        expect(oimSameValueZeroGuard(undefined, 'a')).toBe(false);
    });
});

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

describe('a value has moved when SameValueZero says it has', () => {
    it('holds a value that did not move, including NaN against itself', () => {
        expect(oimSameValueZeroGuard(1, 1)).toBe(true);
        expect(oimSameValueZeroGuard('x', 'x')).toBe(true);
        // The same reason as `oimSameValueZeroGuard`: a derivation whose value is `NaN` must
        // not report a move on every derivation for ever.
        expect(oimSameValueZeroGuard(Number.NaN, Number.NaN)).toBe(true);
    });

    it('treats the two zeroes as one value, unlike Object.is', () => {
        // SameValueZero and not `Object.is`: `-0` and `+0` are one value here,
        // which is what a consumer means by "the number did not change".
        expect(oimSameValueZeroGuard(0, -0)).toBe(true);
    });

    it('reports a move for a freshly built object of equal content', () => {
        // BY IDENTITY, which is why a derivation returning a new array every
        // time needs `oimSameSlotSequence` instead: under this one it reports a move on
        // every derivation and wakes the world.
        expect(oimSameValueZeroGuard({ a: 1 }, { a: 1 })).toBe(false);
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
