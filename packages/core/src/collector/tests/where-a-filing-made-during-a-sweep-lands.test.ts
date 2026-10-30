import type { TOIMEditable } from '../../slot/types/TOIMEditable';

import { OIM_SLICE_LENGTH_MS, oimSliceOfMs } from '../../index';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { oimGetReleaseDueAfterWriteMs } from '../../slot/utils/oimGetReleaseDueAfterWriteMs';
import { oimSetReleaseDueAfterWriteMs } from '../../slot/utils/oimSetReleaseDueAfterWriteMs';
import { OIMLogAndContinueErrorPolicy } from '../../error/OIMLogAndContinueErrorPolicy';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE';
import type { TOIMSlot } from '../../index';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';
import { createOIMStoreSlot } from '../../slot/utils/createOIMStoreSlot';
import { OIMDB } from '../../db/OIMDB';
import { OIMSlotOwner } from '../../slot/OIMSlotOwner';

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
    owner: new OIMSlotOwner(),
});

const ownerThatOnGiveBack = (giveBack: () => void): IOIMSlotOwner => ({
    holdSlot: () => undefined,
    unholdSlot: giveBack,
    releaseSlotIfUnheld: giveBack,
    unsafeMutateSlot: () => undefined,
    subscribeToSlot: () => 0,
    unsubscribeFromSlot: () => false,
    onSlotFirstSubscribed: () => undefined,
    onSlotLastUnsubscribed: () => undefined,
});

const createFixture =() => {
    let ms = START;
    const slotReleaseWheel = new OIMSlotReleaseWheel({
        getNowMs: () => ms,
        timer: () => () => undefined,
        errorPolicy: OIMLogAndContinueErrorPolicy.INSTANCE,
        getReleaseDueMs: oimGetReleaseDueAfterWriteMs,
        setReleaseDueMs: oimSetReleaseDueAfterWriteMs,
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
        expect(oimSliceOfMs(START + WINDOW)).toBe(oimSliceOfMs(START));
        expect(oimSliceOfMs(START + 2 * WINDOW + WINDOW)).toBe(oimSliceOfMs(START));
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
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(oimSliceOfMs(fixture.nowMs()));

        // NOT CONDEMNED is the whole claim: the identity was filed after the pass
        // had emptied the slice it landed in, so the walk met it, found
        // `slice > upTo` false, and took it.
        expect(pokedMinted).toBe(false);
        // And it is still ON the clock, rather than having been swept off it.
        expect(fixture.slotReleaseQueue.isSlotReleaseScheduled(minted)).toBe(true);
    });

    it('is filed above the slice that pass was walking, and not merely left alone', () => {
        const fixture = createFixture();
        const doomed = slot();
        const minted = slot();
        (doomed as TOIMEditable<typeof doomed>).owner = ownerThatOnGiveBack(() => { fixture.slotReleaseQueue.scheduleSlotRelease(
            minted, fixture.slotReleaseQueue.getNowMs()); });
        fixture.slotReleaseQueue.scheduleSlotRelease(doomed, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        const upTo = oimSliceOfMs(fixture.nowMs());
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(upTo);

        // The earliest thing on the clock is the admission, and it sits one slice
        // above the pass — the earliest slice that pass cannot reach.
        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(upTo + 1);
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
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(oimSliceOfMs(fixture.nowMs()));

        fixture.at(START + 4 * OIM_SLICE_LENGTH_MS);
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(oimSliceOfMs(fixture.nowMs()));
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
        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(oimSliceOfMs(START + WINDOW));
    });

    it('and an admission after a sweep has finished is not pushed past it', () => {
        const fixture = createFixture();
        const doomed = slot();
        (doomed as TOIMEditable<typeof doomed>).owner = ownerThatOnGiveBack(() => undefined);
        fixture.slotReleaseQueue.scheduleSlotRelease(doomed, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        const upTo = oimSliceOfMs(fixture.nowMs());
        fixture.slotReleaseQueue.releaseDueUpToSliceNumber(upTo);

        const after = slot();
        fixture.slotReleaseQueue.scheduleSlotRelease(after, fixture.slotReleaseQueue.getNowMs());
        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(oimSliceOfMs(fixture.nowMs() + WINDOW));
        expect(oimSliceOfMs(fixture.nowMs() + WINDOW)).toBeLessThanOrEqual(upTo);
    });

    it('and a release that THROWS does not leave the floor standing', () => {
        const fixture = createFixture();
        const angry = slot();
        (angry as TOIMEditable<typeof angry>).owner = ownerThatOnGiveBack(() => { throw new Error('a release handler threw'); });
        fixture.slotReleaseQueue.scheduleSlotRelease(angry, fixture.slotReleaseQueue.getNowMs());

        fixture.at(START + 2 * WINDOW);
        const upTo = oimSliceOfMs(fixture.nowMs());
        expect(() => { fixture.slotReleaseQueue.releaseDueUpToSliceNumber(upTo); }).toThrow('a release handler threw');

        // Left set, every admission for the rest of the process would be filed at
        // `upTo + 1` or later, whatever window its service asked for.
        const after = slot();
        fixture.slotReleaseQueue.scheduleSlotRelease(after, fixture.slotReleaseQueue.getNowMs());
        expect(fixture.slotReleaseQueue.nextReleaseSliceNumber).toBe(oimSliceOfMs(fixture.nowMs() + WINDOW));
    });
});
