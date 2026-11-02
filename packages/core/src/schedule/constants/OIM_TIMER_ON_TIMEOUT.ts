import type { TOIMTimer } from '../types/TOIMTimer';
import type { TOIMDisposer } from '../types/TOIMDisposer';

const SET_TIMEOUT_MAX_DELAY_MS = 2_147_483_647;

export const OIM_TIMER_ON_TIMEOUT: TOIMTimer = (run: () => void, inMs: number): TOIMDisposer => {
    const handle = setTimeout(run, Math.min(inMs, SET_TIMEOUT_MAX_DELAY_MS));
    (handle as { unref?: () => void }).unref?.();
    return () => { clearTimeout(handle); };
};
