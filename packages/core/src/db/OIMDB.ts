import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { TOIMChannelClock } from '../channel/types/TOIMChannelClock';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import type { TOIMCollectorSlot } from '../collector/types/TOIMCollectorSlot';
import type { TOIMDBOptions } from './types/TOIMDBOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMEffectBody } from '../effect/types/TOIMEffectBody';
import type { TOIMDisposer } from '../schedule/types/TOIMDisposer';
import { OIMChannelService } from '../channel/OIMChannelService';
import { createOIMChannelSlot } from '../channel/utils/createOIMChannelSlot';
import { createOIMCollectorSlot } from '../collector/utils/createOIMCollectorSlot';
import { createOIMChannelSchedulerTimer } from '../schedule/utils/createOIMChannelSchedulerTimer';
import { OIM_TIMER_ON_TIMEOUT } from '../schedule/constants/OIM_TIMER_ON_TIMEOUT';
import { OIMLogAndContinueErrorPolicy } from '../error/OIMLogAndContinueErrorPolicy';
import { OIMEffectService } from '../effect/OIMEffectService';
import { createOIMEffectDisposer } from '../effect/utils/createOIMEffectDisposer';
import type { IOIMSlotReleaseListener } from '../collector/interfaces/IOIMSlotReleaseListener';

export class OIMDB<TSchemas = unknown> implements IOIMChannelMap {
    public readonly clock: TOIMChannelClock = { revision: 0, epoch: 0 };
    public readonly collectorSlot: TOIMCollectorSlot;
    public readonly defaultChannelSlot: TOIMChannelSlot;
    public readonly schemas: TSchemas;

    private slotDataCellCount = 0;

    public constructor(options?: TOIMDBOptions<TSchemas>) {
        const errorPolicy = options?.errorPolicy ?? OIMLogAndContinueErrorPolicy.INSTANCE;
        this.collectorSlot = createOIMCollectorSlot({
            getNowMs: options?.getNowMs ?? Date.now,
            releaseTimer: options?.releaseTimer ?? OIM_TIMER_ON_TIMEOUT,
            errorPolicy,
        });
        const channelScheduler = options?.channelScheduler;
        this.defaultChannelSlot = createOIMChannelSlot({
            clock: this.clock,
            collectorSlot: this.collectorSlot,
            errorPolicy,
            timer: channelScheduler === undefined ? undefined : createOIMChannelSchedulerTimer(channelScheduler),
            onBeforeFlush: options?.onBeforeFlush,
        });
        this.schemas = options?.createSchemas?.(this) as TSchemas;
    }

    public createEffect(body: TOIMEffectBody): TOIMDisposer;
    public createEffect(
        body: TOIMEffectBody, sourceSlots: readonly (TOIMSlot & { readonly sourceComputeds?: never })[], options?: { lazy?: boolean | undefined },
    ): TOIMDisposer;
    public createEffect(
        body: TOIMEffectBody,
        sourceSlots?: readonly (TOIMSlot & { readonly sourceComputeds?: never })[],
        options?: { lazy?: boolean | undefined },
    ): TOIMDisposer {
        const effectService = OIMEffectService.INSTANCE;
        if (sourceSlots === undefined) {
            const effect = effectService.createSourceTrackingEffect(this, body);
            return () => { effectService.disposeEffect(effect); };
        }
        if (options?.lazy === true) return effectService.subscribeEffect(this, body, sourceSlots);
        return createOIMEffectDisposer(this, body, sourceSlots);
    }

    public addSlotReleaseListener(slotReleaseListener: IOIMSlotReleaseListener): TOIMDisposer {
        const slotReleaseListeners = this.collectorSlot.slotReleaseListeners;
        slotReleaseListeners.push(slotReleaseListener);
        return () => {
            const at = slotReleaseListeners.indexOf(slotReleaseListener);
            if (at !== -1) slotReleaseListeners.splice(at, 1);
        };
    }

    public claimSlotDataCell(): number {
        return this.slotDataCellCount++;
    }

    public flush(): void {
        OIMChannelService.INSTANCE.flush(this.defaultChannelSlot);
    }

    public dispose(): void {
        OIMChannelService.INSTANCE.dropChannelSlot(this.defaultChannelSlot);
    }
}
