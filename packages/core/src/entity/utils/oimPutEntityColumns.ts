import type { OIMEntitySlot } from '../OIMEntitySlot';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import { oimPatchEntityColumns } from './oimPatchEntityColumns';
import { oimClearDepartedEntityColumns } from './oimClearDepartedEntityColumns';

export function oimPutEntityColumns(
    slot: OIMEntitySlot,
    entity: object,
    sameValueGuard: TOIMSameValueGuard,
    changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | undefined {
    const prevEntity = slot.content as Record<string, unknown> | undefined;
    if (prevEntity === undefined) return undefined;
    const target = oimPatchEntityColumns(slot, entity, sameValueGuard, changedColumnNames, targetOf);
    return oimClearDepartedEntityColumns(prevEntity, prevEntity, entity, target, changedColumnNames, targetOf);
}
