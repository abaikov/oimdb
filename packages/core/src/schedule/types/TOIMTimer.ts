import type { TOIMDisposer } from './TOIMDisposer';

export type TOIMTimer = (run: () => void, inMs: number) => TOIMDisposer;
