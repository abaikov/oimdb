import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';

export function oimPatchEntityColumns(
    slot: TOIMEntitySlot,
    patch: object,
    sameValueGuard: TOIMSameValueGuard,
    changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | undefined {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let target: Record<string, unknown> | undefined;
    for (const name in source) {
        if (sameValueGuard(entity[name], source[name])) continue;
        (target ??= targetOf(entity))[name] = source[name];
        if (changedColumnNames !== undefined) changedColumnNames.push(name);
    }
    return target;
}
