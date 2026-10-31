import type { TOIMSlot, TOIMEffectBody, TOIMDisposer } from '@oimdb/core';
import { effect as effectIn } from '../soimdb/effect';
import { getInstance } from './getInstance';

export function effect(
    body: TOIMEffectBody,
    sourceSlots?: readonly (TOIMSlot & { readonly value?: never })[],
    options: { lazy?: boolean | undefined } = {},
): TOIMDisposer {
    return effectIn(getInstance(), body, sourceSlots, options);
}
