import type { OIMEntitySlot } from '../OIMEntitySlot';
import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import { patchOIMEntityColumns } from './patchOIMEntityColumns';
import { clearOIMDepartedEntityColumns } from './clearOIMDepartedEntityColumns';

export function putOIMEntityColumns(
    slot: OIMEntitySlot,
    entity: object,
    sameValueGuard: TOIMSameValueGuard,
    changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | undefined {
    const prevEntity = slot.content as Record<string, unknown> | undefined;
    if (prevEntity === undefined) return undefined;
    const target = patchOIMEntityColumns(slot, entity, sameValueGuard, changedColumnNames, targetOf);
    return clearOIMDepartedEntityColumns(prevEntity, prevEntity, entity, target, changedColumnNames, targetOf);
}
