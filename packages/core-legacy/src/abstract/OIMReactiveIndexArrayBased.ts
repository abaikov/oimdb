import type { TOIMKey } from '../types/TOIMKey';
import type { OIMIndexArrayBased } from './OIMIndexArrayBased';
import type { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMReactiveIndex } from './OIMReactiveIndex';

/**
 * Reactive wrapper over an array-based (ordered) keyed index. The array
 * counterpart of {@link OIMReactiveIndexSetBased}, and bodiless for the same
 * reason: it only names the read shapes.
 */
export abstract class OIMReactiveIndexArrayBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexArrayBased<TKey, TPk>,
> extends OIMReactiveIndex<
    TKey,
    TPk,
    TIndex,
    TPk[],
    readonly TOIMAnyEntitySlot<TPk>[]
> {}
