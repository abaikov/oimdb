import type { OIMComputedSlot } from '../OIMComputedSlot';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { TOIMChannelClock } from '../../channel/types/TOIMChannelClock';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMComputedValueReleaser } from '../types/TOIMComputedValueReleaser';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';
import { oimRefreshSourceComputeds } from './oimRefreshSourceComputeds';
import { oimHasSourceChangedSinceLastRun } from './oimHasSourceChangedSinceLastRun';
import { oimIsRevisionAfter } from '../../channel/utils/oimIsRevisionAfter';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { OIM_SLOT_FLAG_RELEASED } from '../../slot/constants/OIM_SLOT_FLAG_RELEASED';
import { OIMSourceTracker } from '../OIMSourceTracker';

export function oimRefreshComputedSlot<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined>>(
    computedSlot: TComputedSlot,
    derive: (computedSlot: TComputedSlot) => TValue,
    sameValueGuard: TOIMSameValueGuard<TValue>,
    releaseValue: TOIMComputedValueReleaser<TValue>,
    channelClock: TOIMChannelClock,
): void {
    if (computedSlot.isDeriving) return;
    if (computedSlot.checkedAtRevision === channelClock.revision && computedSlot.checkedAtEpoch === channelClock.epoch) return;
    const editableComputedSlot = computedSlot as TOIMEditable<TOIMComputedContentSlot<TValue>>;
    const outerSourceTracker = OIMSourceTracker.activeSourceTracker;
    OIMSourceTracker.activeSourceTracker = undefined;
    let next: TValue;
    try {
        oimRefreshSourceComputeds(computedSlot.sourceComputeds);
        if (computedSlot.ranAtRevision !== -1 && !oimHasSourceChangedSinceLastRun(computedSlot)) {
            editableComputedSlot.checkedAtRevision = channelClock.revision;
            editableComputedSlot.checkedAtEpoch = channelClock.epoch;
            return;
        }
        editableComputedSlot.isDeriving = true;
        try {
            next = derive(computedSlot);
        } finally {
            editableComputedSlot.isDeriving = false;
        }
    } finally {
        OIMSourceTracker.activeSourceTracker = outerSourceTracker;
    }
    const hasDerived = computedSlot.ranAtRevision !== -1;
    if ((computedSlot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) {
        releaseValue(next);
        return;
    }
    const prevValue = (computedSlot as unknown as OIMComputedSlot<TValue>).content;
    const isSameValue = sameValueGuard(prevValue, next);
    editableComputedSlot.ranAtRevision = channelClock.revision;
    editableComputedSlot.ranAtEpoch = channelClock.epoch;
    editableComputedSlot.checkedAtRevision = channelClock.revision;
    editableComputedSlot.checkedAtEpoch = channelClock.epoch;
    if (isSameValue) {
        if (next !== prevValue) releaseValue(next);
        return;
    }
    (editableComputedSlot as unknown as TOIMEditable<OIMComputedSlot<TValue>>).content = next;
    if (hasDerived) releaseValue(prevValue);
    const sourceSlots = computedSlot.sourceSlots;
    const sourceComputeds = computedSlot.sourceComputeds;
    const sourceCount = sourceSlots.length + sourceComputeds.length;
    let newestSourceRevision = -1;
    let newestSourceEpoch = -1;
    for (let i = 0; i < sourceCount; i++) {
        const sourceSlot: TOIMSlot = i < sourceSlots.length
            ? sourceSlots[i] : sourceComputeds[i - sourceSlots.length];
        if (!oimIsRevisionAfter(sourceSlot.changedAtRevision, sourceSlot.changedAtEpoch, newestSourceRevision, newestSourceEpoch)) continue;
        newestSourceRevision = sourceSlot.changedAtRevision;
        newestSourceEpoch = sourceSlot.changedAtEpoch;
    }
    editableComputedSlot.changedAtRevision = sourceCount === 0 ? channelClock.revision : newestSourceRevision;
    editableComputedSlot.changedAtEpoch = sourceCount === 0 ? channelClock.epoch : newestSourceEpoch;
}
