import type { TOIMEntityContentSlot } from '../../../core/src/entity/types/TOIMEntityContentSlot';
import type { TOIMSameValueGuard } from '../../../core/src/slot/types/TOIMSameValueGuard';
import { oimIsProtoKey } from '../../../core/src/entity/utils/oimIsProtoKey';
import { oimIsPlainObject } from '../../../core/src/entity/utils/oimIsPlainObject';

export function changedColumns(
    slot: TOIMEntityContentSlot,
    patch: object,
    sameValueGuard: TOIMSameValueGuard,
): string[] | undefined {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const inherited = !oimIsPlainObject(source);
    for (const name in source) {
        if (oimIsProtoKey(name)) continue;
        if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
        if (sameValueGuard(entity[name], source[name])) continue;
        (changed ??= []).push(name);
    }
    return changed;
}
