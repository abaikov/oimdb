import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';

export const getOIMSliceOfMs = (ms: number): number => Math.floor(ms / OIM_SLICE_LENGTH_MS);
