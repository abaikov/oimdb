import type { TOIMChannelScheduler } from '../../channel/types/TOIMChannelScheduler';
import type { TOIMTimer } from '../types/TOIMTimer';
import { OIM_NOTHING_TO_DISPOSE } from '../constants/OIM_NOTHING_TO_DISPOSE';

export const oimTimerOfChannelScheduler = (scheduler: TOIMChannelScheduler): TOIMTimer => (run: () => void): (() => void) => {
    scheduler(run);
    return OIM_NOTHING_TO_DISPOSE;
};
