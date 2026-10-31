import type { TOIMSlot, TOIMEffectBody, TOIMDisposer } from '@oimdb/core';
import { effect as effectIn } from '../oimdb/effect';
import { db } from './db';

export function effect(
    body: TOIMEffectBody,
    sourceSlots?: readonly (TOIMSlot & { readonly value?: never })[],
    options: { lazy?: boolean | undefined } = {},
): TOIMDisposer {
    return effectIn(db(), body, sourceSlots, options);
}
