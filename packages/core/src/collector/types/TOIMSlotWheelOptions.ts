import type { TOIMTimer } from '../../schedule/types/TOIMTimer';
import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';

export type TOIMSlotWheelOptions = {
    getNowMs: () => number;
    timer: TOIMTimer;
    errorPolicy: IOIMErrorPolicy;
};
