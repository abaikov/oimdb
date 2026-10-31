import type { OIMEntitySlot } from '../OIMEntitySlot';
import { oimIsProtoKey } from './oimIsProtoKey';

export function oimOwnedColumnNames(
    slot: OIMEntitySlot,
    names: readonly string[],
): string[] | undefined {
    const entity = slot.content as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    let owned: string[] | undefined;
    for (let i = 0; i < names.length; i++) {
        if (oimIsProtoKey(names[i])) continue;
        if (!Object.prototype.hasOwnProperty.call(entity, names[i])) continue;
        if (entity[names[i]] === undefined) continue;
        (owned ??= []).push(names[i]);
    }
    return owned;
}
