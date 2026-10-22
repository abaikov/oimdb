import { OIM_SLICE_LENGTH_MS } from '../constants/OIM_SLICE_LENGTH_MS';

export const oimSliceOfMs = (ms: number): number => Math.floor(ms / OIM_SLICE_LENGTH_MS);
