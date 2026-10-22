import type { TOIMEntitySlot } from '../../../core/src/engine/entity/types/TOIMEntitySlot';
import type { TOIMSameValueGuard } from '../../../core/src/engine/slot/types/TOIMSameValueGuard';
import { oimIsProtoKey } from '../../../core/src/engine/entity/utils/oimIsProtoKey';
import { oimIsPlain } from '../../../core/src/engine/entity/utils/oimIsPlain';

export function changedColumns(
    slot: TOIMEntitySlot,
    patch: object,
    sameValueGuard: TOIMSameValueGuard,
): string[] | undefined {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    const source = patch as Record<string, unknown>;
    let changed: string[] | undefined;
    const inherited = !oimIsPlain(source);
    for (const name in source) {
        if (oimIsProtoKey(name)) continue;
        if (inherited && !Object.prototype.hasOwnProperty.call(source, name)) continue;
        if (sameValueGuard(entity[name], source[name])) continue;
        (changed ??= []).push(name);
    }
    return changed;
}
