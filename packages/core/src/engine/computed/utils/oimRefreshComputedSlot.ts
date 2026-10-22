import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';
import type { TOIMChannelClock } from '../../channel/types/TOIMChannelClock';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';
import { oimRefreshSourceComputeds } from './oimRefreshSourceComputeds';
import { oimHasSourceChangedSinceLastRun } from './oimHasSourceChangedSinceLastRun';
import { oimIsRevisionAfter } from '../../channel/utils/oimIsRevisionAfter';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export function oimRefreshComputedSlot<TValue, TKey>(
    computedSlot: TOIMComputedSlot<TValue, TKey>,
    derive: (computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue,
    sameValueGuard: TOIMSameValueGuard<TValue>,
    channelClock: TOIMChannelClock,
): void {
    if (computedSlot.isDeriving) return;
    if (computedSlot.checkedAtRevision === channelClock.revision && computedSlot.checkedAtEpoch === channelClock.epoch) return;
    const computedSlotEditable = computedSlot as TOIMSlotEditable<TOIMComputedSlot<TValue, TKey>>;
    oimRefreshSourceComputeds(computedSlot.sourceComputeds);
    if (computedSlot.ranAtRevision !== -1 && !oimHasSourceChangedSinceLastRun(computedSlot)) {
        computedSlotEditable.checkedAtRevision = channelClock.revision;
        computedSlotEditable.checkedAtEpoch = channelClock.epoch;
        return;
    }
    computedSlotEditable.isDeriving = true;
    let next: TValue;
    try {
        next = derive(computedSlot);
    } finally {
        computedSlotEditable.isDeriving = false;
    }
    const isSameValue = sameValueGuard(computedSlot.value, next);
    computedSlotEditable.ranAtRevision = channelClock.revision;
    computedSlotEditable.ranAtEpoch = channelClock.epoch;
    computedSlotEditable.checkedAtRevision = channelClock.revision;
    computedSlotEditable.checkedAtEpoch = channelClock.epoch;
    if (isSameValue) return;
    computedSlotEditable.value = next;
    const sourceSlots = computedSlot.sourceSlots;
    const sourceComputeds = computedSlot.sourceComputeds;
    const sourceCount = sourceSlots.length + sourceComputeds.length;
    let newestSourceRevision = -1;
    let newestSourceEpoch = -1;
    for (let i = 0; i < sourceCount; i++) {
        const source: TOIMSlot = i < sourceSlots.length
            ? sourceSlots[i] : sourceComputeds[i - sourceSlots.length];
        if (!oimIsRevisionAfter(source.changedAtRevision, source.changedAtEpoch, newestSourceRevision, newestSourceEpoch)) continue;
        newestSourceRevision = source.changedAtRevision;
        newestSourceEpoch = source.changedAtEpoch;
    }
    computedSlotEditable.changedAtRevision = sourceCount === 0 ? channelClock.revision : newestSourceRevision;
    computedSlotEditable.changedAtEpoch = sourceCount === 0 ? channelClock.epoch : newestSourceEpoch;
}
