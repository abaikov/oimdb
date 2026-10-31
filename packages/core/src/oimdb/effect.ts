import type { OIMDB, TOIMSlot, TOIMEffectBody, TOIMDisposer } from '@oimdb/core';
import { OIMEffectService } from '@oimdb/core';

export function effect(
    db: OIMDB,
    body: TOIMEffectBody,
    sourceSlots?: readonly (TOIMSlot & { readonly value?: never })[],
    options: { lazy?: boolean | undefined } = {},
): TOIMDisposer {
    const effectService = OIMEffectService.INSTANCE;
    const created = sourceSlots === undefined
        ? effectService.createSourceTrackingEffect(db, body)
        : options.lazy === true
            ? effectService.createEffect(db, body, sourceSlots)
            : effectService.createAndRunEffect(db, body, sourceSlots);
    return () => { effectService.disposeEffect(created); };
}
