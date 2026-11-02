import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';
import type { TOIMChannelScheduler } from '../../channel/types/TOIMChannelScheduler';
import type { TOIMTimer } from '../../schedule/types/TOIMTimer';
import type { OIMDB } from '../OIMDB';

export type TOIMDBOptions<TSchemas = unknown> = {
    channelScheduler?: TOIMChannelScheduler | undefined;
    errorPolicy?: IOIMErrorPolicy | undefined;
    onBeforeFlush?: (() => void) | undefined;
    getNowMs?: (() => number) | undefined;
    releaseTimer?: TOIMTimer | undefined;
    createSchemas?: ((db: OIMDB) => TSchemas) | undefined;
};
