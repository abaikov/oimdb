import { OIMDB } from '../../index';
import type { TOIMComputedContentSlot, TOIMEntitySlot, TOIMSlot, TOIMStoreKey } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../index';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TRow = { id: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const rowsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TRow>() });
    const rows = rowsService.createStoreSlot(db);
    const slot = rowsService.writeSlotContentByKey(rows, 'r1', { id: 'r1', rank: 1 });
    db.flush();
    return { db, rowsService, rows, slot };
};

const createDerived = (
    db: OIMDB,
    sourceSlots: readonly TOIMSlot[],
    sourceComputeds: ReadonlyArray<() => TOIMComputedContentSlot>,
    derive: () => number,
) => {
    const computedService = createOIMSingleComputedService<number>({ sameValueGuard: (a, b) => a === b, initialValue: 0 });
    const derived = computedService.createComputedStoreSlot(
        db,
        derive,
        () => ({ sourceSlots, sourceComputeds: sourceComputeds.map(source => source()) }),
    );
    const derivedService = {
        getSingleSlot: (storeSlot: typeof derived) => computedService.computedSingleSlotService.getSingleSlot(storeSlot),
        holdSingleSlot: (storeSlot: typeof derived) => computedService.computedSingleSlotService.holdSingleSlot(storeSlot),
        getSingleValue: (storeSlot: typeof derived) => {
            const computedSlot = computedService.computedSingleSlotService.getSingleSlot(storeSlot);
            return readValueWithoutTracking(computedSlot);
        },
    };
    return { derivedService, derived };
};

/**
 * How many times anything asked this slot when it last changed. The getter stands
 * in for the field for the length of one case; nothing in the engine writes it
 * except the channel, and the setter keeps that working.
 */
const countAsksOf = (slot: TOIMEntitySlot<TRow, TOIMStoreKey>) => {
    const counted = { reads: 0 };
    let revision = slot.changedAtRevision;
    Object.defineProperty(slot, 'changedAtRevision', {
        configurable: true,
        get: () => { counted.reads++; return revision; },
        set: (next: number) => { revision = next; },
    });
    return counted;
};

describe('one walk per clock reading, however many readers', () => {
    it('asks a source once for a derivation read twice at one reading', () => {
        const { db, slot } = createFixture();
        const { derivedService, derived } = createDerived(db, [slot], [], () => slot.entity?.rank ?? 0);
        const asked = countAsksOf(slot);

        derivedService.getSingleValue(derived);
        const afterFirst = asked.reads;
        derivedService.getSingleValue(derived);
        derivedService.getSingleValue(derived);

        expect(afterFirst).toBeGreaterThan(0);
        expect(asked.reads).toBe(afterFirst);
    });

    it('asks again once a write has advanced the clock', () => {
        const { db, rowsService, slot } = createFixture();
        const { derivedService, derived } = createDerived(db, [slot], [], () => slot.entity?.rank ?? 0);
        derivedService.holdSingleSlot(derived);
        derivedService.getSingleValue(derived);
        const asked = countAsksOf(slot);

        rowsService.slotContentService.updateEntity(slot, { rank: 2 });
        db.flush();
        derivedService.getSingleValue(derived);

        // THE OTHER HALF OF THE PROPOSITION. A stamp that skipped this ask would
        // serve the value from before the write, which is the one failure a
        // memo of this kind can produce and no test of the first case can see.
        expect(asked.reads).toBeGreaterThan(0);
        expect(derivedService.getSingleValue(derived)).toBe(2);
    });

    it('asks a shared source once for two derivations that both read it', () => {
        const { db, slot } = createFixture();
        const { derivedService: sharedService, derived: shared } = createDerived(db, [slot], [], () => slot.entity?.rank ?? 0);
        const { derivedService: leftService, derived: left } = createDerived(
            db, [], [() => sharedService.getSingleSlot(shared)], () => sharedService.getSingleValue(shared) + 1,
        );
        const { derivedService: rightService, derived: right } = createDerived(
            db, [], [() => sharedService.getSingleSlot(shared)], () => sharedService.getSingleValue(shared) + 2,
        );
        const asked = countAsksOf(slot);

        leftService.getSingleValue(left);
        const afterLeft = asked.reads;
        rightService.getSingleValue(right);

        // THE FIRST TOUCH IS SHARED, and this is the case that says so: the second
        // reader arrives through a different derivation and still stops at the
        // shared node's stamp.
        expect(afterLeft).toBeGreaterThan(0);
        expect(asked.reads).toBe(afterLeft);
        expect(leftService.getSingleValue(left)).toBe(2);
        expect(rightService.getSingleValue(right)).toBe(3);
    });

    it('lets the next reader hit the same throw instead of the value from before it', () => {
        const { db, rowsService, slot } = createFixture();
        let poisoned = false;
        const { derivedService, derived } = createDerived(db, [slot], [], () => {
            if (poisoned) throw new Error('derive refuses this row');
            return slot.entity?.rank ?? 0;
        });
        derivedService.holdSingleSlot(derived);
        derivedService.getSingleValue(derived);
        expect(derivedService.getSingleValue(derived)).toBe(1);

        poisoned = true;
        rowsService.slotContentService.updateEntity(slot, { rank: 9 });
        db.flush();

        // THE STAMP MAY NOT SWALLOW A FAILURE. A derivation that threw has not
        // answered, so the next reader — at the same clock reading, from anywhere —
        // must meet the same throw and not the value the derivation held before it.
        expect(() => derivedService.getSingleValue(derived)).toThrow('derive refuses this row');
        expect(() => derivedService.getSingleValue(derived)).toThrow('derive refuses this row');
        expect(() => derivedService.getSingleValue(derived)).toThrow('derive refuses this row');

        // AND THERE IS NO READ THAT SKIPS THE DERIVE: asking again cannot return the
        // number held before the failure; it comes back only when the derive stops throwing.
        poisoned = false;
        expect(derivedService.getSingleValue(derived)).toBe(9);
    });

    it('serves a value derived after the write to a reader that arrives before the flush', () => {
        const { db, rowsService, slot } = createFixture();
        const { derivedService, derived } = createDerived(db, [slot], [], () => slot.entity?.rank ?? 0);
        derivedService.getSingleValue(derived);

        rowsService.slotContentService.updateEntity(slot, { rank: 7 });
        // NO FLUSH. This is the read a design that recomputes at the frame boundary
        // answers with the value from before the write; an asking derivation cannot.
        derivedService.getSingleValue(derived);

        expect(derivedService.getSingleValue(derived)).toBe(7);
    });
});
