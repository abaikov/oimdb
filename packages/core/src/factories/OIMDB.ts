import type { IOIMEntityWriter } from '../engine/entity/interfaces/IOIMEntityWriter';
import type { IOIMIndexKeysService } from '../engine/index/interfaces/IOIMIndexKeysService';
import type { IOIMSlotStamp } from '../engine/slot/interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMChannelMap } from '../engine/channel/interfaces/IOIMChannelMap';
import type { TOIMChannelClock } from '../engine/channel/types/TOIMChannelClock';
import type { TOIMChannelSlot } from '../engine/channel/types/TOIMChannelSlot';
import type { TOIMCollectorSlot } from '../engine/collector/types/TOIMCollectorSlot';
import type { TOIMSlot } from '../engine/slot/types/TOIMSlot';
import type { TOIMDBOptions } from './types/TOIMDBOptions';
import { OIMChannelService } from '../engine/channel/OIMChannelService';
import { createOIMChannelSlot } from '../engine/channel/utils/createOIMChannelSlot';
import { createOIMCollectorSlot } from '../engine/collector/utils/createOIMCollectorSlot';
import { oimTimerOfChannelScheduler } from '../engine/schedule/utils/oimTimerOfChannelScheduler';
import { OIM_TIMER_ON_TIMEOUT } from '../engine/schedule/constants/OIM_TIMER_ON_TIMEOUT';
import { OIMErrorPolicyLogAndContinue } from '../engine/error/OIMErrorPolicyLogAndContinue';

export class OIMDB implements IOIMChannelMap {
    public readonly clock: TOIMChannelClock = { revision: 0, epoch: 0 };
    public readonly collectorSlot: TOIMCollectorSlot;
    public readonly defaultChannelSlot: TOIMChannelSlot;

    public readonly entityWriter: IOIMEntityWriter | undefined;
    public readonly slotStamp: IOIMSlotStamp<TOIMSlot> | undefined;

    public readonly slotReleasePolicy: IOIMSlotReleasePolicy | undefined;
    public readonly indexKeysService: IOIMIndexKeysService | undefined;

    public constructor(options?: TOIMDBOptions) {
        const errorPolicy = options?.errorPolicy ?? OIMErrorPolicyLogAndContinue.INSTANCE;
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
            timer: channelScheduler === undefined ? undefined : oimTimerOfChannelScheduler(channelScheduler),
            onBeforeFlush: options?.onBeforeFlush,
        });
        this.entityWriter = options?.entityWriter;
        this.slotStamp = options?.slotStamp;
        this.slotReleasePolicy = options?.slotReleasePolicy;
        this.indexKeysService = options?.indexKeysService;
    }

    public flush(): void {
        OIMChannelService.INSTANCE.flush(this.defaultChannelSlot);
    }
}
