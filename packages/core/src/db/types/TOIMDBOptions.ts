import type { IOIMEntityWriter } from '../../entity/interfaces/IOIMEntityWriter';
import type { IOIMIndexKeysService } from '../../index/interfaces/IOIMIndexKeysService';
import type { IOIMSlotStamp } from '../../slot/interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';
import type { TOIMChannelScheduler } from '../../channel/types/TOIMChannelScheduler';
import type { TOIMTimer } from '../../schedule/types/TOIMTimer';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

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
