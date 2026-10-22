import type { TRetainedArmReading } from './TRetainedArmReading';

export type TRetainedWorkerOutput =
    | { readonly status: 'measured'; readonly reading: TRetainedArmReading }
    | { readonly status: 'failed'; readonly reason: string };
