import type { TOIMPk } from '../types/TOIMPk';
import type { TOIMKeyPath } from '../types/TOIMKeyPath';
import { OIMCompositeKeyTupleFactory } from '../core/OIMCompositeKeyTupleFactory';

/**
 * `ctk` — **c**reate **t**uple **k**ey. Declares a composite key's shape once: the key type, then its
 * segment names in the order every tuple will follow.
 *
 * ```ts
 * import { ctk } from '@oimdb/core';
 *
 * type TCardKeys = { boardId: string; cardId: number };
 * const cardKey = ctk<TCardKeys>()(['boardId', 'cardId']);
 *
 * cardKey({ boardId: 'b1', cardId: 9 });   // → ['b1', 9]
 * ```
 *
 * The call is curried because TypeScript infers all type arguments or none: naming `TKeys` explicitly
 * would otherwise widen the segment names from literals to `string` and lose the checking that is the
 * entire point. The names cannot come from `TKeys` either — a type's property order is not a value,
 * and the order is exactly what has to be pinned down.
 */
export const ctk =
    <TKeys extends Record<string, TOIMPk>>() =>
    <const TName extends keyof TKeys & string>(
        names: readonly TName[]
    ): ((source: Pick<TKeys, TName>) => TOIMKeyPath) =>
        // The class stays under the hood; what comes out is its builder alone, so a key is one call.
        new OIMCompositeKeyTupleFactory<TKeys, TName>(names).create;
