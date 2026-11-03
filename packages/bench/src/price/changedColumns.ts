import type { TOIMEntityContentSlot } from '../../../core/src/entity/types/TOIMEntityContentSlot';
import type { TOIMSameValueGuard } from '../../../core/src/slot/types/TOIMSameValueGuard';
import { isOIMProtoKey } from '../../../core/src/entity/utils/isOIMProtoKey';
import { isOIMPlainObject } from '../../../core/src/entity/utils/isOIMPlainObject';

export function changedColumns(
    slot: TOIMEntityContentSlot,
    patch: object,
    sameValueGuard: TOIMSameValueGuard,
): string[] | undefined {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const inherited = !isOIMPlainObject(source);
    for (const name in source) {
        if (isOIMProtoKey(name)) continue;
        if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
        if (sameValueGuard(entity[name], source[name])) continue;
        (changed ??= []).push(name);
    }
    return changed;
}
