import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';
import type { TOIMChannelScheduler } from '../../channel/types/TOIMChannelScheduler';
import type { TOIMTimer } from '../../schedule/types/TOIMTimer';

export type TOIMDBOptions = {
    channelScheduler?: TOIMChannelScheduler | undefined;
    errorPolicy?: IOIMErrorPolicy | undefined;
    onBeforeFlush?: (() => void) | undefined;
    getNowMs?: (() => number) | undefined;
    releaseTimer?: TOIMTimer | undefined;
};
