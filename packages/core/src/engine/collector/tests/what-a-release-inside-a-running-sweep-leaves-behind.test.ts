import { OIMDefaults } from '../../../factories/OIMDefaults';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { oimGetReleaseDueAfterWriteMs } from '../../slot/utils/oimGetReleaseDueAfterWriteMs';
import { oimSetReleaseDueAfterWriteMs } from '../../slot/utils/oimSetReleaseDueAfterWriteMs';
import { oimSliceOfMs } from '../utils/oimSliceOfMs';
import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';
import { OIMLogAndContinueErrorPolicy } from '../../error/OIMLogAndContinueErrorPolicy';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import { OIM_SLOT_FLAG_EMPTY } from '../../slot/constants/OIM_SLOT_FLAG_EMPTY';
import { oimMarkSlotReleased } from '../../slot/utils/oimMarkSlotReleased';

const START = 1_000_000;
const WINDOW = 100;

const anIdentity = (): TOIMSlotEditable<TOIMSlot> => ({
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
    storeSlot: undefined,
    owner: OIMDefaults.STANDALONE_SLOT_OWNER.getValue(),
});

const ownerThatWhenAsked = (asked: () => void): IOIMSlotOwner => ({
    holdSlot: () => undefined,
    unholdSlot: () => undefined,
    releaseSlotIfUnheld: () => { asked(); },
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
    return { slotReleaseWheel, at: (value: number): void => { ms = value; }, nowMs: (): number => ms };
};

const scheduleSlotRelease = (slotReleaseWheel: OIMSlotReleaseWheel, slot: TOIMSlot): void => {
    slotReleaseWheel.scheduleSlotRelease(slot, slotReleaseWheel.getNowMs());
};

const releaseDueUpToSliceNumber = (slotReleaseWheel: OIMSlotReleaseWheel, upToSliceNumber: number): void => {
    slotReleaseWheel.sweepUpToSliceNumber(upToSliceNumber);
};

const cascadeOnto = (slotReleaseWheel: OIMSlotReleaseWheel, taken: TOIMSlotEditable<TOIMSlot>): void => {
    slotReleaseWheel.cancelSlotRelease(taken);
    oimMarkSlotReleased(taken);
};

describe('an identity a cascade releases while the sweep is still walking', () => {
    it('is off the clock before that pass ends, when it sat in the slice being walked', () => {
        const fixture = createFixture();
        const condemned = anIdentity();
        const cascaded = anIdentity();
        let askedAboutCascaded = 0;
        cascaded.owner = ownerThatWhenAsked(() => { askedAboutCascaded++; });
        condemned.owner = ownerThatWhenAsked(() => { cascadeOnto(fixture.slotReleaseWheel, cascaded); });
        scheduleSlotRelease(fixture.slotReleaseWheel, condemned);
        scheduleSlotRelease(fixture.slotReleaseWheel, cascaded);

        fixture.at(START + 2 * WINDOW);
        releaseDueUpToSliceNumber(fixture.slotReleaseWheel, oimSliceOfMs(fixture.nowMs()));

        expect(fixture.slotReleaseWheel.isSlotReleaseScheduled(cascaded)).toBe(false);
        expect(askedAboutCascaded).toBe(0);
        expect(fixture.slotReleaseWheel.getNextSliceNumber()).toBeUndefined();
    });

    it('is off the clock before that pass ends, when it sat in a LATER slice the pass had yet to reach', () => {
        const fixture = createFixture();
        const condemned = anIdentity();
        const cascaded = anIdentity();
        let askedAboutCascaded = 0;
        cascaded.owner = ownerThatWhenAsked(() => { askedAboutCascaded++; });
        condemned.owner = ownerThatWhenAsked(() => { cascadeOnto(fixture.slotReleaseWheel, cascaded); });
        scheduleSlotRelease(fixture.slotReleaseWheel, condemned);
        scheduleSlotRelease(fixture.slotReleaseWheel, cascaded);
        expect(fixture.slotReleaseWheel.getNextSliceNumber())
            .toBe(oimSliceOfMs(START + WINDOW));

        fixture.at(START + 2 * OIM_SLICE_LENGTH_MS);
        releaseDueUpToSliceNumber(fixture.slotReleaseWheel, oimSliceOfMs(fixture.nowMs()));

        expect(fixture.slotReleaseWheel.isSlotReleaseScheduled(cascaded)).toBe(false);
        expect(askedAboutCascaded).toBe(0);
        expect(fixture.slotReleaseWheel.getNextSliceNumber()).toBeUndefined();
    });
});

describe('an identity that was already released when the pass reached it', () => {
    it('is asked nothing, and does not stop the pass reaching the identities behind it', () => {
        const fixture = createFixture();
        const released = anIdentity();
        oimMarkSlotReleased(released);
        const behind = anIdentity();
        let askedAboutBehind = 0;
        behind.owner = ownerThatWhenAsked(() => { askedAboutBehind++; });
        scheduleSlotRelease(fixture.slotReleaseWheel, released);
        scheduleSlotRelease(fixture.slotReleaseWheel, behind);

        fixture.at(START + 2 * WINDOW);
        releaseDueUpToSliceNumber(fixture.slotReleaseWheel, oimSliceOfMs(fixture.nowMs()));

        expect(askedAboutBehind).toBe(1);
        expect(fixture.slotReleaseWheel.getNextSliceNumber()).toBeUndefined();
    });
});
