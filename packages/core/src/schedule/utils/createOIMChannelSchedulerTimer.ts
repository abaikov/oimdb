import type { TOIMChannelScheduler } from '../../channel/types/TOIMChannelScheduler';
import type { TOIMTimer } from '../types/TOIMTimer';
import { OIM_NOOP_DISPOSER } from '../constants/OIM_NOOP_DISPOSER';

export const createOIMChannelSchedulerTimer = (scheduler: TOIMChannelScheduler): TOIMTimer => (run: () => void): (() => void) => {
    scheduler(run);
    return OIM_NOOP_DISPOSER;
};
