import type { TPoint, TPointKey } from './types';

export const POINTS: readonly TPoint[] = [
    { key: 'default', n: 10_000, window: 32, processes: 3 },
    { key: 'wide', n: 10_000, window: 100, processes: 2 },
    { key: 'small', n: 3_200, window: 32, processes: 2 },
];

export const POINT_KEYS: readonly TPointKey[] = POINTS.map(point => point.key);

export const pointOf = (key: string): TPoint => {
    const found = POINTS.find(point => point.key === key);
    if (found === undefined) {
        throw new Error(`Unknown point "${key}". Known: ${POINT_KEYS.join(', ')}`);
    }
    return found;
};

export const sameScale = (a: TPoint, b: TPoint): boolean =>
    a.key === b.key && a.n === b.n && a.window === b.window;

export const withProcesses = (point: TPoint, processes: number | undefined): TPoint =>
    processes === undefined ? point : { ...point, processes };

export const samePoint =(a: TPoint, b: TPoint): boolean =>
    a.key === b.key && a.n === b.n && a.window === b.window && a.processes === b.processes;
