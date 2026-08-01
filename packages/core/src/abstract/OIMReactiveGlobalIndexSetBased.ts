import { TOIMKey } from '../types/TOIMKey';
import { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMGlobalIndexSetBased } from './OIMGlobalIndexSetBased';
import { OIMReactiveGlobalIndex } from './OIMReactiveGlobalIndex';

/**
 * Reactive wrapper over a set-based keyless index. Bodiless on purpose — it
 * only names the read shapes; see {@link OIMReactiveIndexSetBased}.
 */
export abstract class OIMReactiveGlobalIndexSetBased<
    TPk extends TOIMKey,
    TIndex extends OIMGlobalIndexSetBased<TPk>,
> extends OIMReactiveGlobalIndex<
    TPk,
    TIndex,
    Set<TPk>,
    ReadonlySet<TOIMAnyEntitySlot<TPk>>
> {}
