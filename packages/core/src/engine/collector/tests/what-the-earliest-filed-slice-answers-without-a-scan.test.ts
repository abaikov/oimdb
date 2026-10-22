import { OIMReleaseSlotQueueService } from '../OIMReleaseSlotQueueService';
import { OIMReleaseSlotCollectorServiceAfterIdle } from '../OIMReleaseSlotCollectorServiceAfterIdle';
import { createOIMReleaseSlotCollectorSlot } from '../utils/createOIMReleaseSlotCollectorSlot';
import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';
import { OIMErrorPolicyLogAndContinue } from '../../error/OIMErrorPolicyLogAndContinue';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

type TCountedSlots = Map<number, Set<TOIMSlot>> & { keyReads: number };

const slotDueAt = (dueMs: number): TOIMSlot => {
    const slot = { releaseDueAfterIdleMs: dueMs, isReleased: false };
    return Object.assign(slot, {
        owner: { releaseSlotIfUnheld: () => { slot.isReleased = true; } },
    }) as unknown as TOIMSlot;
};

function createSlotReleaseQueue(nowMs: () => number) {
    const releaseSlotCollectorSlot = createOIMReleaseSlotCollectorSlot({
        getNowMs: nowMs,
        releaseTimer: () => () => undefined,
        errorPolicy: OIMErrorPolicyLogAndContinue.INSTANCE,
    });
    const counted = releaseSlotCollectorSlot.slotsBySliceNumber as TCountedSlots;
    counted.keyReads = 0;
    const keys = counted.keys.bind(counted);
    counted.keys = () => {
        counted.keyReads += counted.size;
        return keys();
    };
    return {
        counted,
        scheduleSlotRelease: (slot: TOIMSlot): void => {
            OIMReleaseSlotQueueService.INSTANCE.scheduleSlotRelease(
                releaseSlotCollectorSlot, OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE, slot, releaseSlotCollectorSlot.getNowMs(),
            );
        },
        cancelSlotRelease: (slot: TOIMSlot): void => {
            OIMReleaseSlotQueueService.INSTANCE.cancelSlotRelease(releaseSlotCollectorSlot, slot);
        },
        cancelAllSlotReleases: (): void => {
            OIMReleaseSlotQueueService.INSTANCE.cancelAllSlotReleases(releaseSlotCollectorSlot);
        },
        releaseDueUpToSliceNumber: (upToSliceNumber: number): void => {
            OIMReleaseSlotQueueService.INSTANCE.releaseDueUpToSliceNumber(
                releaseSlotCollectorSlot, OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE, upToSliceNumber,
            );
        },
        getNextReleaseSliceNumber: (): number | undefined => OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(releaseSlotCollectorSlot),
    };
}

describe('what the earliest filed slice answers without a scan', () => {
    it('reads no key at all when nothing has emptied the earliest slice', () => {
        const nowMs = 0;
        const { scheduleSlotRelease, getNextReleaseSliceNumber, counted } = createSlotReleaseQueue(() => nowMs);
        for (let i = 0; i < 64; i++) {
            scheduleSlotRelease(slotDueAt(i * OIM_SLICE_LENGTH_MS));
        }
        counted.keyReads = 0;

        for (let i = 0; i < 100; i++) getNextReleaseSliceNumber();

        expect(counted.keyReads).toBe(0);
        expect(getNextReleaseSliceNumber()).toBe(0);
    });

    it('names the earliest slice after an out-of-order arrival', () => {
        const nowMs = 0;
        const { scheduleSlotRelease, getNextReleaseSliceNumber } = createSlotReleaseQueue(() => nowMs);
        scheduleSlotRelease(slotDueAt(40 * OIM_SLICE_LENGTH_MS));
        scheduleSlotRelease(slotDueAt(7 * OIM_SLICE_LENGTH_MS));
        scheduleSlotRelease(slotDueAt(19 * OIM_SLICE_LENGTH_MS));

        expect(getNextReleaseSliceNumber()).toBe(7);
    });

    it('names the next slice once the earliest one is cancelled away', () => {
        const nowMs = 0;
        const { scheduleSlotRelease, cancelSlotRelease, getNextReleaseSliceNumber } = createSlotReleaseQueue(() => nowMs);
        const earliest = slotDueAt(7 * OIM_SLICE_LENGTH_MS);
        scheduleSlotRelease(earliest);
        scheduleSlotRelease(slotDueAt(19 * OIM_SLICE_LENGTH_MS));
        expect(getNextReleaseSliceNumber()).toBe(7);

        cancelSlotRelease(earliest);

        expect(getNextReleaseSliceNumber()).toBe(19);
    });

    it('keeps the earliest slice when a slot sharing it is cancelled', () => {
        const nowMs = 0;
        const { scheduleSlotRelease, cancelSlotRelease, getNextReleaseSliceNumber } = createSlotReleaseQueue(() => nowMs);
        const leaving = slotDueAt(7 * OIM_SLICE_LENGTH_MS);
        scheduleSlotRelease(leaving);
        scheduleSlotRelease(slotDueAt(7 * OIM_SLICE_LENGTH_MS + 1));

        cancelSlotRelease(leaving);

        expect(getNextReleaseSliceNumber()).toBe(7);
    });

    it('names the next slice after a sweep took the earliest ones', () => {
        let nowMs = 0;
        const { scheduleSlotRelease, releaseDueUpToSliceNumber, getNextReleaseSliceNumber } = createSlotReleaseQueue(() => nowMs);
        for (const at of [4, 9, 31]) {
            scheduleSlotRelease(slotDueAt(at * OIM_SLICE_LENGTH_MS));
        }
        nowMs = 10 * OIM_SLICE_LENGTH_MS;

        releaseDueUpToSliceNumber(9);

        expect(getNextReleaseSliceNumber()).toBe(31);
    });

    it('answers nothing once every filing is cancelled wholesale', () => {
        const nowMs = 0;
        const { scheduleSlotRelease, cancelAllSlotReleases, getNextReleaseSliceNumber } = createSlotReleaseQueue(() => nowMs);
        scheduleSlotRelease(slotDueAt(7 * OIM_SLICE_LENGTH_MS));
        expect(getNextReleaseSliceNumber()).toBe(7);

        cancelAllSlotReleases();

        expect(getNextReleaseSliceNumber()).toBeUndefined();
    });

    it('reads no key when the earliest slice is emptied and filed again before anyone asks', () => {
        const nowMs = 0;
        const { scheduleSlotRelease, cancelSlotRelease, getNextReleaseSliceNumber, counted } = createSlotReleaseQueue(() => nowMs);
        const leaving = slotDueAt(7 * OIM_SLICE_LENGTH_MS);
        scheduleSlotRelease(leaving);
        for (let i = 0; i < 64; i++) {
            scheduleSlotRelease(slotDueAt((20 + i) * OIM_SLICE_LENGTH_MS));
        }
        expect(getNextReleaseSliceNumber()).toBe(7);

        cancelSlotRelease(leaving);
        scheduleSlotRelease(slotDueAt(7 * OIM_SLICE_LENGTH_MS));
        counted.keyReads = 0;

        expect(getNextReleaseSliceNumber()).toBe(7);
        expect(counted.keyReads).toBe(0);
    });

    it('names the re-filed slice when a moved slot becomes the earliest', () => {
        const nowMs = 0;
        const { scheduleSlotRelease, getNextReleaseSliceNumber } = createSlotReleaseQueue(() => nowMs);
        const moving = slotDueAt(40 * OIM_SLICE_LENGTH_MS);
        scheduleSlotRelease(moving);
        scheduleSlotRelease(slotDueAt(19 * OIM_SLICE_LENGTH_MS));
        expect(getNextReleaseSliceNumber()).toBe(19);

        (moving as { releaseDueAfterIdleMs: number }).releaseDueAfterIdleMs = 3 * OIM_SLICE_LENGTH_MS;
        scheduleSlotRelease(moving);

        expect(getNextReleaseSliceNumber()).toBe(3);
    });
});
