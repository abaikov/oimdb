import { OIMDefaults } from '../../../factories/OIMDefaults';
import { OIMReleaseSlotQueueService } from '../OIMReleaseSlotQueueService';
import { OIMReleaseSlotCollectorServiceAfterWrite } from '../OIMReleaseSlotCollectorServiceAfterWrite';
import { createOIMReleaseSlotCollectorSlot } from '../utils/createOIMReleaseSlotCollectorSlot';
import { oimSliceOfMs } from '../utils/oimSliceOfMs';
import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';
import { OIMErrorPolicyLogAndContinue } from '../../error/OIMErrorPolicyLogAndContinue';
import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import type { TOIMReleaseSlotCollectorSlot } from '../types/TOIMReleaseSlotCollectorSlot';
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
    subscribeToSlot: () => 0,
    unsubscribeFromSlot: () => false,
});

const createFixture =() => {
    let ms = START;
    const releaseSlotCollectorSlot = createOIMReleaseSlotCollectorSlot({
        getNowMs: () => ms,
        releaseTimer: () => () => undefined,
        errorPolicy: OIMErrorPolicyLogAndContinue.INSTANCE,
    });
    return { releaseSlotCollectorSlot, at: (value: number): void => { ms = value; }, nowMs: (): number => ms };
};

const scheduleSlotRelease = (releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot): void => {
    OIMReleaseSlotQueueService.INSTANCE.scheduleSlotRelease(
        releaseSlotCollectorSlot, OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE, slot, releaseSlotCollectorSlot.getNowMs(),
    );
};

const releaseDueUpToSliceNumber = (releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, upToSliceNumber: number): void => {
    OIMReleaseSlotQueueService.INSTANCE.releaseDueUpToSliceNumber(
        releaseSlotCollectorSlot, OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE, upToSliceNumber,
    );
};

const cascadeOnto = (releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, taken: TOIMSlotEditable<TOIMSlot>): void => {
    OIMReleaseSlotQueueService.INSTANCE.cancelSlotRelease(releaseSlotCollectorSlot, taken);
    oimMarkSlotReleased(taken);
};

describe('an identity a cascade releases while the sweep is still walking', () => {
    it('is off the clock before that pass ends, when it sat in the slice being walked', () => {
        const fixture = createFixture();
        const condemned = anIdentity();
        const cascaded = anIdentity();
        let askedAboutCascaded = 0;
        cascaded.owner = ownerThatWhenAsked(() => { askedAboutCascaded++; });
        condemned.owner = ownerThatWhenAsked(() => { cascadeOnto(fixture.releaseSlotCollectorSlot, cascaded); });
        scheduleSlotRelease(fixture.releaseSlotCollectorSlot, condemned);
        scheduleSlotRelease(fixture.releaseSlotCollectorSlot, cascaded);

        fixture.at(START + 2 * WINDOW);
        releaseDueUpToSliceNumber(fixture.releaseSlotCollectorSlot, oimSliceOfMs(fixture.nowMs()));

        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(fixture.releaseSlotCollectorSlot, cascaded)).toBe(false);
        expect(askedAboutCascaded).toBe(0);
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(fixture.releaseSlotCollectorSlot)).toBeUndefined();
    });

    it('is off the clock before that pass ends, when it sat in a LATER slice the pass had yet to reach', () => {
        const fixture = createFixture();
        const condemned = anIdentity();
        const cascaded = anIdentity();
        let askedAboutCascaded = 0;
        cascaded.owner = ownerThatWhenAsked(() => { askedAboutCascaded++; });
        condemned.owner = ownerThatWhenAsked(() => { cascadeOnto(fixture.releaseSlotCollectorSlot, cascaded); });
        scheduleSlotRelease(fixture.releaseSlotCollectorSlot, condemned);
        scheduleSlotRelease(fixture.releaseSlotCollectorSlot, cascaded);
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(fixture.releaseSlotCollectorSlot))
            .toBe(oimSliceOfMs(START + WINDOW));

        fixture.at(START + 2 * OIM_SLICE_LENGTH_MS);
        releaseDueUpToSliceNumber(fixture.releaseSlotCollectorSlot, oimSliceOfMs(fixture.nowMs()));

        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(fixture.releaseSlotCollectorSlot, cascaded)).toBe(false);
        expect(askedAboutCascaded).toBe(0);
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(fixture.releaseSlotCollectorSlot)).toBeUndefined();
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
        scheduleSlotRelease(fixture.releaseSlotCollectorSlot, released);
        scheduleSlotRelease(fixture.releaseSlotCollectorSlot, behind);

        fixture.at(START + 2 * WINDOW);
        releaseDueUpToSliceNumber(fixture.releaseSlotCollectorSlot, oimSliceOfMs(fixture.nowMs()));

        expect(askedAboutBehind).toBe(1);
        expect(OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(fixture.releaseSlotCollectorSlot)).toBeUndefined();
    });
});
