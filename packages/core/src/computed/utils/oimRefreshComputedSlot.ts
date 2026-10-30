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
import type { OIMSourceTracker } from '../OIMSourceTracker';

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
    oimRefreshSourceComputeds(computedSlot.sourceComputeds);
    if (computedSlot.ranAtRevision !== -1 && !oimHasSourceChangedSinceLastRun(computedSlot)) {
        editableComputedSlot.checkedAtRevision = channelClock.revision;
        editableComputedSlot.checkedAtEpoch = channelClock.epoch;
        return;
    }
    const hasDerived = computedSlot.ranAtRevision !== -1;
    editableComputedSlot.isDeriving = true;
    let next: TValue;
    try {
        next = derive(computedSlot);
    } finally {
        editableComputedSlot.isDeriving = false;
    }
    if ((computedSlot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) {
        releaseValue(next);
        return;
    }
    const prevValue = computedSlot.value;
    const isSameValue = sameValueGuard(prevValue, next);
    editableComputedSlot.ranAtRevision = channelClock.revision;
    editableComputedSlot.ranAtEpoch = channelClock.epoch;
    editableComputedSlot.checkedAtRevision = channelClock.revision;
    editableComputedSlot.checkedAtEpoch = channelClock.epoch;
    if (isSameValue) {
        if (next !== prevValue) releaseValue(next);
        return;
    }
    editableComputedSlot.value = next;
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
