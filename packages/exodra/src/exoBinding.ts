import type { TExoBindable } from '@exodra/reactivity-types';
import { OIM_FROZEN_EMPTY_SLOTS, OIMEffectService, oimRefreshSourceComputeds, type IOIMChannelMap } from '@oimdb/core';
import { exoSource } from './exoSource';
import type { TOIMExoBinding } from './types/TOIMExoBinding';

export function exoBinding<TValue>(
    channelMap: IOIMChannelMap,
    binding: TOIMExoBinding<TValue>,
): TExoBindable<TValue> {
    const sourceSlots = binding.sourceSlots ?? OIM_FROZEN_EMPTY_SLOTS;
    const sourceComputeds = binding.sourceComputeds ?? OIM_FROZEN_EMPTY_SLOTS;
    const derive = binding.derive;
    return exoSource<TValue>(
        () => {
            oimRefreshSourceComputeds(sourceComputeds);
            return derive();
        },
        onChange => OIMEffectService.INSTANCE.subscribeEffect(channelMap, sourceSlots, sourceComputeds, onChange),
    );
}
