import type { IOIMEntityWriter } from '../../engine/entity/interfaces/IOIMEntityWriter';
import type { IOIMIndexKeysService } from '../../engine/index/interfaces/IOIMIndexKeysService';
import type { IOIMSlotStamp } from '../../engine/slot/interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMErrorPolicy } from '../../engine/error/interfaces/IOIMErrorPolicy';
import type { TOIMChannelScheduler } from '../../engine/channel/types/TOIMChannelScheduler';
import type { TOIMTimer } from '../../engine/schedule/types/TOIMTimer';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';

export type TOIMDBOptions = {
    channelScheduler?: TOIMChannelScheduler | undefined;
    errorPolicy?: IOIMErrorPolicy | undefined;
    onBeforeFlush?: (() => void) | undefined;
    getNowMs?: (() => number) | undefined;
    releaseTimer?: TOIMTimer | undefined;
    entityWriter?: IOIMEntityWriter | undefined;
    indexKeysService?: IOIMIndexKeysService | undefined;
    slotStamp?: IOIMSlotStamp<TOIMSlot> | undefined;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
};
