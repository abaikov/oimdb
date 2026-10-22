import type { TOIMKey } from '../types/TOIMKey';
import type { OIMIndexSetBased } from './OIMIndexSetBased';
import type { TOIMAnyEntitySlot } from '../types/TOIMEntitySlot';
import { OIMReactiveIndex } from './OIMReactiveIndex';

/**
 * Reactive wrapper over a set-based keyed index.
 *
 * It carries no members of its own: naming `Set<TPk>` / `ReadonlySet<slot>` as
 * the read shapes IS the whole job, and {@link OIMReactiveIndex} already
 * delegates against those. The class stays because callers name it in
 * signatures ("a reactive index whose reads are sets") — that distinction is
 * static, resolved by the type checker, never by probing a value at runtime.
 */
export abstract class OIMReactiveIndexSetBased<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
    TIndex extends OIMIndexSetBased<TKey, TPk>,
> extends OIMReactiveIndex<
    TKey,
    TPk,
    TIndex,
    Set<TPk>,
    ReadonlySet<TOIMAnyEntitySlot<TPk>>
> {}
