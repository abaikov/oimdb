import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';

export function oimPatchEntityColumn(
    slot: TOIMEntitySlot,
    columnName: string,
    value: unknown,
    sameValueGuard: TOIMSameValueGuard,
    changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | undefined {
    const entity = slot.entity as Record<string, unknown> | undefined;
    if (entity === undefined) return undefined;
    if (sameValueGuard(entity[columnName], value)) return undefined;
    const target = targetOf(entity);
    target[columnName] = value;
    if (changedColumnNames !== undefined) changedColumnNames.push(columnName);
    return target;
}
