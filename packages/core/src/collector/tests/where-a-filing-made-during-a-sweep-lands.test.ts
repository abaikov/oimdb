import type { TOIMEditable } from '../../slot/types/TOIMEditable';

import { OIM_SLICE_LENGTH_MS, getOIMSliceOfMs } from '../../index';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { peekOIMReleaseDueAfterWriteMs } from '../../slot/utils/peekOIMReleaseDueAfterWriteMs';
import { setOIMReleaseDueAfterWriteMs } from '../../slot/utils/setOIMReleaseDueAfterWriteMs';
import { OIMLogAndContinueErrorPolicy } from '../../error/OIMLogAndContinueErrorPolicy';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE';
import type { TOIMSlot } from '../../index';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';
import { createOIMStoreSlot } from '../../slot/utils/createOIMStoreSlot';
import { OIMDB } from '../../db/OIMDB';
import { TestSlotOwner } from '../../../tests/support/TestSlotOwner';

const testStoreSlot = createOIMStoreSlot(undefined, new OIMDB().defaultChannelSlot, undefined);

/** Every slot in the same slice: 1_000_000 through 1_000_500 all fall in slice 976. */
const START = 1_000_000;
/** Shorter than one slice, which is what puts a re-filing back where it came from. */
const WINDOW = 100;

const slot = (): TOIMSlot => ({
    effects: undefined,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    effectEdges: undefined,
    holdCount: 0,
    slotFlags: OIM_SLOT_FLAG_EMPTY,
    releaseDueAfterWriteMs: START + WINDOW,
    releaseDueAfterIdleMs: -1,
    releaseDueAfterUnholdMs: -1,
    columnSlotStore: undefined,
    storeSlot: testStoreSlot,
    owner: new TestSlotOwner(),
    data: undefined,
});

const ownerThatOnGiveBack = (giveBack: () => void): IOIMSlotOwner => ({
    holdSlot: () => undefined,
    unholdSlot: giveBack,
    releaseSlotIfUnheld: giveBack,
    unsafeMutateSlot: () => undefined,
    subscribeToSlot: () => 0,
    unsubscribeFromSlot: () => false,
});

const createFixture =() => {
    let ms = START;
    const slotReleaseWheel = new OIMSlotReleaseWheel({
        getNowMs: () => ms,
        timer: () => () => undefined,
        errorPolicy: OIMLogAndContinueErrorPolicy.INSTANCE,
        getReleaseDueMs: peekOIMReleaseDueAfterWriteMs,
        setReleaseDueMs: setOIMReleaseDueAfterWriteMs,
        releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE,
    });
    const slotReleaseQueue = {
        getNowMs: (): number => slotReleaseWheel.getNowMs(),
        scheduleSlotRelease: (aSlot: TOIMSlot, nowMs: number): void => { slotReleaseWheel.scheduleSlotRelease(aSlot, nowMs); },
        releaseDueUpToSliceNumber: (upToSliceNumber: number): void => { slotReleaseWheel.sweepUpToSliceNumber(upToSliceNumber); },
        isSlotReleaseScheduled: (aSlot: TOIMSlot): boolean => slotReleaseWheel.isSlotReleaseScheduled(aSlot),
        get nextReleaseSliceNumber(): number | undefined {
            return slotReleaseWheel.getNextSliceNumber();
        },
    };
    return { slotReleaseQueue, at: (value: number): void => { ms = value; }, nowMs: (): number => ms };
};

describe('the slice arithmetic every case below rests on', () => {
    it('puts the whole reproduction inside one slice', () => {
        expect(OIM_SLICE_LENGTH_MS).toBeGreaterThan(WINDOW * 2);
        expect(getOIMSliceOfMs(START + WINDOW)).toBe(getOIMSliceOfMs(START));
        expect(getOIMSliceOfMs(START + 2 * WINDOW + WINDOW)).toBe(getOIMSliceOfMs(START));
    });
});

describe('an identity admitted from inside a running sweep', () => {
    it('is not condemned by the pass that was running when it arrived', () => {
        const fixture = createFixture();
        const doomed = slot();
        const minted = slot();
        let pokedMinted = false;
        (minted as TOIMEditable<typeof minted>).owner = ownerThatOnGiveBack(() => { pokedMinted = true; });
        // THE CASCADE, AS A SINGLE LINE: the sweep condemns `doomed` and asks its
        // owner, and somewhere below that question a fresh identity is minted.
        (doomed as TOIMEditable<typeof doomed>).owner = ownerThatOnGiveBack(() => { fixture.slotReleaseQueue.scheduleSlotRelease(
            minted, fixture.slotReleaseQueue.getNowMs()); });
        fixture.slotReleaseQueue.scheduleSlotRelease(doomed, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(getOIMSliceOfMs(fixture.nowMs()));

        // NOT CONDEMNED is the whole claim: the identity was filed after the pass
        // had emptied the slice it landed in, so the walk met it, found
        // `slice > upTo` false, and took it.
        expect(pokedMinted).toBe(false);
        // And it is still ON the clock, rather than having been swept off it.
        expect(fixture.slotReleaseQueue.isSlotReleaseScheduled(minted)).toBe(true);
    });

    it('is filed in its own slice once the pass is over, and not inside the pass', () => {
        const fixture = createFixture();
        const doomed = slot();
        const minted = slot();
        (doomed as TOIMEditable<typeof doomed>).owner = ownerThatOnGiveBack(() => { fixture.slotReleaseQueue.scheduleSlotRelease(
            minted, fixture.slotReleaseQueue.getNowMs()); });
        fixture.slotReleaseQueue.scheduleSlotRelease(doomed, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        const upTo = getOIMSliceOfMs(fixture.nowMs());
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(upTo);

        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(upTo);
    });

    it('and the next sweep does take it, so nothing has been made immortal', () => {
        const fixture = createFixture();
        const doomed = slot();
        const minted = slot();
        let pokedMinted = false;
        (minted as TOIMEditable<typeof minted>).owner = ownerThatOnGiveBack(() => { pokedMinted = true; });
        (doomed as TOIMEditable<typeof doomed>).owner = ownerThatOnGiveBack(() => { fixture.slotReleaseQueue.scheduleSlotRelease(
            minted, fixture.slotReleaseQueue.getNowMs()); });
        fixture.slotReleaseQueue.scheduleSlotRelease(doomed, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(getOIMSliceOfMs(fixture.nowMs()));

        fixture.at(START + 4 * OIM_SLICE_LENGTH_MS);
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(getOIMSliceOfMs(fixture.nowMs()));
        expect(pokedMinted).toBe(true);
    });
});

// The floor is a fact about a RUNNING pass and nothing else: both cases below
// pass on a `addToSliceNumber` that raises no floor at all.
describe('outside a sweep there is no floor', () => {
    it('an ordinary admission is filed at the slice its own window falls in', () => {
        const fixture = createFixture();
        const one = slot();
        fixture.slotReleaseQueue.scheduleSlotRelease(one, fixture.slotReleaseQueue.getNowMs());
        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(getOIMSliceOfMs(START + WINDOW));
    });

    it('and an admission after a sweep has finished is not pushed past it', () => {
        const fixture = createFixture();
        const doomed = slot();
        (doomed as TOIMEditable<typeof doomed>).owner = ownerThatOnGiveBack(() => undefined);
        fixture.slotReleaseQueue.scheduleSlotRelease(doomed, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        const upTo = getOIMSliceOfMs(fixture.nowMs());
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(upTo);

        const after = slot();
        fixture.slotReleaseQueue.scheduleSlotRelease(after, fixture.slotReleaseQueue.getNowMs());
        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(getOIMSliceOfMs(fixture.nowMs() + WINDOW));
        expect(getOIMSliceOfMs(fixture.nowMs() + WINDOW)).toBeLessThanOrEqual(upTo);
    });

    it('and a release that THROWS does not leave the floor standing', () => {
        const fixture = createFixture();
        const angry = slot();
        (angry as TOIMEditable<typeof angry>).owner = ownerThatOnGiveBack(() => { throw new Error('a release handler threw'); });
        fixture.slotReleaseQueue.scheduleSlotRelease(angry, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        const upTo = getOIMSliceOfMs(fixture.nowMs());
        expect(() => { fixture.slotReleaseQueue.releaseDueUpToSliceNumber(upTo); }).toThrow('a release handler threw');

        // Left set, every admission for the rest of the process would be filed at
        // `upTo + 1` or later, whatever window its service asked for.
        const after = slot();
        fixture.slotReleaseQueue.scheduleSlotRelease(after, fixture.slotReleaseQueue.getNowMs());
        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(getOIMSliceOfMs(fixture.nowMs() + WINDOW));
    });
});
