import type { TMeasuredOutcome } from './types';

export type TRunCount = {
    processes: number;
    samples: number;
    repeat: number;
    runs: number;
};

export const runCountOf = (outcome: TMeasuredOutcome): TRunCount => {
    const processes = outcome.processMins.length;
    return {
        processes,
        samples: outcome.samples,
        repeat: outcome.repeat,
        runs: processes * outcome.samples * outcome.repeat,
    };
};

export const runCountText = (count: TRunCount): string =>
    `${count.processes}p×${count.samples}s×${count.repeat}r=${count.runs}`;
