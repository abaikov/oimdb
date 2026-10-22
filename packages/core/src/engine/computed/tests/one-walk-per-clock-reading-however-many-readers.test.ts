import { OIMDB, createOIMComputedService, createOIMEntityService, OIMSlotStoreServiceSingleSlotDriven } from '../../../index';
import type { TOIMComputedSlot, TOIMEntitySlot, TOIMSlot, TOIMStoreKey } from '../../../index';

type TRow = { id: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    const rows = rowsService.createStoreSlot(db);
    const slot = rowsService.slotContentService.upsertEntity(rows, { id: 'r1', rank: 1 });
    db.flush();
    return { db, rowsService, rows, slot };
};

const createDerived = (
    db: OIMDB,
    sourceSlots: readonly TOIMSlot[],
    sourceComputeds: ReadonlyArray<() => TOIMComputedSlot>,
    derive: () => number,
) => {
    const computedService = createOIMComputedService<void, number>({
        computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(),
        sameValueGuard: (a, b) => a === b,
        initialValue: 0,
    });
    const derived = computedService.createComputedStoreSlot(
        db,
        derive,
        () => ({ sourceSlots, sourceComputeds: sourceComputeds.map(source => source()) }),
    );
    const derivedService = {
        getSlotByKey: (storeSlot: typeof derived, key: undefined) => computedService.computedCollectionService.getSlotByKey(storeSlot, key),
        holdSlotByKey: (storeSlot: typeof derived, key: undefined) => computedService.computedCollectionService.holdSlotByKey(storeSlot, key),
        getValueByKey: (storeSlot: typeof derived, key: undefined) => {
            const computedSlot = computedService.computedCollectionService.getSlotByKey(storeSlot, key);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
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

        derivedService.getValueByKey(derived, undefined);
        const afterFirst = asked.reads;
        derivedService.getValueByKey(derived, undefined);
        derivedService.getValueByKey(derived, undefined);

        expect(afterFirst).toBeGreaterThan(0);
        expect(asked.reads).toBe(afterFirst);
    });

    it('asks again once a write has advanced the clock', () => {
        const { db, rowsService, slot } = createFixture();
        const { derivedService, derived } = createDerived(db, [slot], [], () => slot.entity?.rank ?? 0);
        derivedService.holdSlotByKey(derived, undefined);
        derivedService.getValueByKey(derived, undefined);
        const asked = countAsksOf(slot);

        rowsService.slotContentService.updateEntity(slot, { rank: 2 });
        db.flush();
        derivedService.getValueByKey(derived, undefined);

        // THE OTHER HALF OF THE PROPOSITION. A stamp that skipped this ask would
        // serve the value from before the write, which is the one failure a
        // memo of this kind can produce and no test of the first case can see.
        expect(asked.reads).toBeGreaterThan(0);
        expect(derivedService.getValueByKey(derived, undefined)).toBe(2);
    });

    it('asks a shared source once for two derivations that both read it', () => {
        const { db, slot } = createFixture();
        const { derivedService: sharedService, derived: shared } = createDerived(db, [slot], [], () => slot.entity?.rank ?? 0);
        const { derivedService: leftService, derived: left } = createDerived(
            db, [], [() => sharedService.getSlotByKey(shared, undefined)], () => sharedService.getValueByKey(shared, undefined) + 1,
        );
        const { derivedService: rightService, derived: right } = createDerived(
            db, [], [() => sharedService.getSlotByKey(shared, undefined)], () => sharedService.getValueByKey(shared, undefined) + 2,
        );
        const asked = countAsksOf(slot);

        leftService.getValueByKey(left, undefined);
        const afterLeft = asked.reads;
        rightService.getValueByKey(right, undefined);

        // THE FIRST TOUCH IS SHARED, and this is the case that says so: the second
        // reader arrives through a different derivation and still stops at the
        // shared node's stamp.
        expect(afterLeft).toBeGreaterThan(0);
        expect(asked.reads).toBe(afterLeft);
        expect(leftService.getValueByKey(left, undefined)).toBe(2);
        expect(rightService.getValueByKey(right, undefined)).toBe(3);
    });

    it('lets the next reader hit the same throw instead of the value from before it', () => {
        const { db, rowsService, slot } = createFixture();
        let poisoned = false;
        const { derivedService, derived } = createDerived(db, [slot], [], () => {
            if (poisoned) throw new Error('derive refuses this row');
            return slot.entity?.rank ?? 0;
        });
        derivedService.holdSlotByKey(derived, undefined);
        derivedService.getValueByKey(derived, undefined);
        expect(derivedService.getValueByKey(derived, undefined)).toBe(1);

        poisoned = true;
        rowsService.slotContentService.updateEntity(slot, { rank: 9 });
        db.flush();

        // THE STAMP MAY NOT SWALLOW A FAILURE. A derivation that threw has not
        // answered, so the next reader — at the same clock reading, from anywhere —
        // must meet the same throw and not the value the derivation held before it.
        expect(() => derivedService.getValueByKey(derived, undefined)).toThrow('derive refuses this row');
        expect(() => derivedService.getValueByKey(derived, undefined)).toThrow('derive refuses this row');
        expect(() => derivedService.getValueByKey(derived, undefined)).toThrow('derive refuses this row');

        // AND THERE IS NO READ THAT SKIPS THE DERIVE: asking again cannot return the
        // number held before the failure; it comes back only when the derive stops throwing.
        poisoned = false;
        expect(derivedService.getValueByKey(derived, undefined)).toBe(9);
    });

    it('serves a value derived after the write to a reader that arrives before the flush', () => {
        const { db, rowsService, slot } = createFixture();
        const { derivedService, derived } = createDerived(db, [slot], [], () => slot.entity?.rank ?? 0);
        derivedService.getValueByKey(derived, undefined);

        rowsService.slotContentService.updateEntity(slot, { rank: 7 });
        // NO FLUSH. This is the read a design that recomputes at the frame boundary
        // answers with the value from before the write; an asking derivation cannot.
        derivedService.getValueByKey(derived, undefined);

        expect(derivedService.getValueByKey(derived, undefined)).toBe(7);
    });
});
