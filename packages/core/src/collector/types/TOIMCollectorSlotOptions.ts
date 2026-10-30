import type { TOIMTimer } from '../../schedule/types/TOIMTimer';
import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';

export type TOIMCollectorSlotOptions = {
    getNowMs: () => number;
    releaseTimer: TOIMTimer;
    errorPolicy: IOIMErrorPolicy;
};
