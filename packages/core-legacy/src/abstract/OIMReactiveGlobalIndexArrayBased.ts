import type { TOIMKey } from '../types/TOIMKey';
import type { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import type { OIMGlobalIndexArrayBased } from './OIMGlobalIndexArrayBased';
import { OIMReactiveGlobalIndex } from './OIMReactiveGlobalIndex';

/**
 * Reactive wrapper over an array-based (ordered) keyless index. Bodiless on
 * purpose — it only names the read shapes.
 */
export abstract class OIMReactiveGlobalIndexArrayBased<
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndexArrayBased<TPk>,
> extends OIMReactiveGlobalIndex<
    TPk,
    TIndex,
    TPk[],
    readonly TOIMAnyEntitySlot<TPk>[]
> {}
