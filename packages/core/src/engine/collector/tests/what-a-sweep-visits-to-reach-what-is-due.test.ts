import { OIMDefaults } from '../../../factories/OIMDefaults';
import { OIMReleaseSlotQueueService } from '../OIMReleaseSlotQueueService';
import { OIMReleaseSlotCollectorServiceAfterIdle } from '../OIMReleaseSlotCollectorServiceAfterIdle';
import { createOIMReleaseSlotCollectorSlot } from '../utils/createOIMReleaseSlotCollectorSlot';
import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';
import { OIMErrorPolicyLogAndContinue } from '../../error/OIMErrorPolicyLogAndContinue';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { oimMarkSlotReleased } from '../../slot/utils/oimMarkSlotReleased';

type TSlicesThatCountVisits = Map<number, Set<TOIMSlot>> & { visits: number };

const slotDueAt = (dueMs: number): TOIMSlotEditable<TOIMSlot> => ({
    effects: undefined,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    effectEdges: undefined,
    holdCount: 0,
    slotFlags: OIM_SLOT_FLAG_EMPTY,
    releaseDueAfterWriteMs: -1,
    releaseDueAfterIdleMs: dueMs,
    releaseDueAfterUnholdMs: -1,
    columnSlotStore: undefined,
    storeSlot: undefined,
    owner: OIMDefaults.STANDALONE_SLOT_OWNER.getValue(),
});

const ownerThatOnRelease = (released: () => void): IOIMSlotOwner => ({
    holdSlot: () => undefined,
    unholdSlot: () => undefined,
    releaseSlotIfUnheld: released,
    subscribeToSlot: () => 0,
    unsubscribeFromSlot: () => false,
});

const takenOffTheClock = (slot: TOIMSlotEditable<TOIMSlot>): void => {
    oimMarkSlotReleased(slot);
};

const createFixture =() => {
    let ms = 0;
    const releaseSlotCollectorSlot = createOIMReleaseSlotCollectorSlot({
        getNowMs: () => ms,
        releaseTimer: () => () => undefined,
        errorPolicy: OIMErrorPolicyLogAndContinue.INSTANCE,
    });
    const slices = releaseSlotCollectorSlot.slotsBySliceNumber as TSlicesThatCountVisits;
    slices.visits = 0;
    const get = slices.get.bind(slices);
    slices.get = (sliceNumber: number) => { slices.visits++; return get(sliceNumber); };
    const keys = slices.keys.bind(slices);
    slices.keys = () => { slices.visits += slices.size; return keys(); };
    const entries = slices[Symbol.iterator].bind(slices);
    slices[Symbol.iterator] = () => { slices.visits += slices.size; return entries(); };
    const scheduleSlotRelease = (slot: TOIMSlot): void => {
        OIMReleaseSlotQueueService.INSTANCE.scheduleSlotRelease(
            releaseSlotCollectorSlot, OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE, slot, releaseSlotCollectorSlot.getNowMs(),
        );
    };
    const fileOne = (dueMs: number): TOIMSlotEditable<TOIMSlot> => {
        const slot = slotDueAt(dueMs);
        slot.owner = ownerThatOnRelease(() => { takenOffTheClock(slot); });
        scheduleSlotRelease(slot);
        return slot;
    };
    const fileOnePerSliceUpTo = (lastSliceNumber: number): TOIMSlotEditable<TOIMSlot>[] => {
        const filed: TOIMSlotEditable<TOIMSlot>[] = [];
        for (let sliceNumber = 0; sliceNumber <= lastSliceNumber; sliceNumber++) {
            filed.push(fileOne(sliceNumber * OIM_SLICE_LENGTH_MS));
        }
        return filed;
    };
    return {
        releaseSlotCollectorSlot,
        slices,
        scheduleSlotRelease,
        fileOne,
        fileOnePerSliceUpTo,
        at: (value: number): void => { ms = value; },
        sweepUpToSliceNumber: (upToSliceNumber: number): number => {
            slices.visits = 0;
            OIMReleaseSlotQueueService.INSTANCE.releaseDueUpToSliceNumber(
                releaseSlotCollectorSlot, OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE, upToSliceNumber,
            );
            return slices.visits;
        },
    };
};

describe('what a sweep visits to reach what is due', () => {
    it('visits no slice at all when the earliest filing is above the cut', () => {
        const few = createFixture();
        few.fileOnePerSliceUpTo(2);
        const many = createFixture();
        const filedByMany = many.fileOnePerSliceUpTo(58);

        expect(few.sweepUpToSliceNumber(-1)).toBe(0);
        expect(many.sweepUpToSliceNumber(-1)).toBe(0);
        expect(filedByMany.every(slot => !oimIsSlotReleased(slot))).toBe(true);
    });

    it('visits one slice to release one, whatever is filed above it', () => {
        const few = createFixture();
        const filedByFew = few.fileOnePerSliceUpTo(2);
        const many = createFixture();
        const filedByMany = many.fileOnePerSliceUpTo(58);

        const visitedByFew = few.sweepUpToSliceNumber(0);
        const visitedByMany = many.sweepUpToSliceNumber(0);

        expect(visitedByMany).toBe(visitedByFew);
        expect(visitedByMany).toBe(1);
        expect(oimIsSlotReleased(filedByFew[0])).toBe(true);
        expect(oimIsSlotReleased(filedByMany[0])).toBe(true);
        expect(filedByMany.slice(1).every(slot => !oimIsSlotReleased(slot))).toBe(true);
    });

    it('releases every slice up to the cut and leaves the ones above it filed', () => {
        const fixture = createFixture();
        const filed = fixture.fileOnePerSliceUpTo(3);
        fixture.fileOne(10 * OIM_SLICE_LENGTH_MS);

        fixture.at(2 * OIM_SLICE_LENGTH_MS + 1);
        fixture.sweepUpToSliceNumber(2);

        expect(filed.map(slot => oimIsSlotReleased(slot))).toEqual([true, true, true, false]);
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(fixture.releaseSlotCollectorSlot)).toBe(3);
    });

    it('does not walk the gap when a long stall leaves the earliest filing far below the cut', () => {
        const fixture = createFixture();
        const stalled = fixture.fileOne(0);

        fixture.at(100_000 * OIM_SLICE_LENGTH_MS);
        const visited = fixture.sweepUpToSliceNumber(100_000);

        expect(oimIsSlotReleased(stalled)).toBe(true);
        expect(visited).toBeLessThan(100);
    });

    it('leaves no floor standing when it found nothing to sweep', () => {
        const fixture = createFixture();

        fixture.sweepUpToSliceNumber(5);
        fixture.fileOne(2 * OIM_SLICE_LENGTH_MS);

        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(fixture.releaseSlotCollectorSlot)).toBe(2);
    });

    it('takes a re-filing made inside the pass only on a later pass', () => {
        const fixture = createFixture();
        const refiled = slotDueAt(0);
        refiled.owner = ownerThatOnRelease(() => { takenOffTheClock(refiled); });
        const condemned = slotDueAt(0);
        condemned.owner = ownerThatOnRelease(() => {
            takenOffTheClock(condemned);
            fixture.scheduleSlotRelease(refiled);
        });
        fixture.scheduleSlotRelease(condemned);

        fixture.sweepUpToSliceNumber(0);

        expect(oimIsSlotReleased(condemned)).toBe(true);
        expect(oimIsSlotReleased(refiled)).toBe(false);
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(fixture.releaseSlotCollectorSlot)).toBe(1);
    });
});
