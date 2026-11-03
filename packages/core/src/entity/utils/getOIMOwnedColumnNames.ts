import type { OIMEntitySlot } from '../OIMEntitySlot';
import { isOIMProtoKey } from './isOIMProtoKey';

export function getOIMOwnedColumnNames(
    slot: OIMEntitySlot,
    names: readonly string[],
): string[] | undefined {
    const entity = slot.content as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    let owned: string[] | undefined;
    for (let i = 0; i < names.length; i++) {
        if (isOIMProtoKey(names[i])) continue;
        if (!Object.prototype.hasOwnProperty.call(entity, names[i])) continue;
        if (entity[names[i]] === undefined) continue;
        (owned ??= []).push(names[i]);
    }
    return owned;
}
