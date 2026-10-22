import type { TOIMComputedSources } from './TOIMComputedSources';

export type TOIMDerivation = TOIMComputedSources & {
    ranAtRevision: number;
    ranAtEpoch: number;
};
