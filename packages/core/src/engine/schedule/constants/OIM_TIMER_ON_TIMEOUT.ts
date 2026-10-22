import type { TOIMTimer } from '../types/TOIMTimer';
import type { TOIMDisposer } from '../types/TOIMDisposer';

export const OIM_TIMER_ON_TIMEOUT: TOIMTimer = (run: () => void, inMs: number): TOIMDisposer => {
    const handle = setTimeout(run, inMs);
    (handle as { unref?: () => void }).unref?.();
    return () => { clearTimeout(handle); };
};
