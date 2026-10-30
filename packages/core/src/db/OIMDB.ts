import type { IOIMEntityWriter } from '../entity/interfaces/IOIMEntityWriter';
import type { IOIMIndexKeysService } from '../index/interfaces/IOIMIndexKeysService';
import type { IOIMSlotStamp } from '../slot/interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMChannelMap } from '../channel/interfaces/IOIMChannelMap';
import type { TOIMChannelClock } from '../channel/types/TOIMChannelClock';
import type { TOIMChannelSlot } from '../channel/types/TOIMChannelSlot';
import type { TOIMCollectorSlot } from '../collector/types/TOIMCollectorSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMDBOptions } from './types/TOIMDBOptions';
import { OIMChannelService } from '../channel/OIMChannelService';
import { createOIMChannelSlot } from '../channel/utils/createOIMChannelSlot';
import { createOIMCollectorSlot } from '../collector/utils/createOIMCollectorSlot';
import { oimTimerOfChannelScheduler } from '../schedule/utils/oimTimerOfChannelScheduler';
import { OIM_TIMER_ON_TIMEOUT } from '../schedule/constants/OIM_TIMER_ON_TIMEOUT';
import { OIMLogAndContinueErrorPolicy } from '../error/OIMLogAndContinueErrorPolicy';

export class OIMDB implements IOIMChannelMap {
    public readonly clock: TOIMChannelClock = { revision: 0, epoch: 0 };
    public readonly collectorSlot: TOIMCollectorSlot;
    public readonly defaultChannelSlot: TOIMChannelSlot;

    public readonly entityWriter: IOIMEntityWriter | undefined;
    public readonly slotStamp: IOIMSlotStamp<TOIMSlot> | undefined;

    public readonly slotReleasePolicy: IOIMSlotReleasePolicy | undefined;
    public readonly indexKeysService: IOIMIndexKeysService | undefined;

    public constructor(options?: TOIMDBOptions) {
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
