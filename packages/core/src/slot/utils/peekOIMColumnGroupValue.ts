import type { TOIMSlot } from '../types/TOIMSlot';
import type { IOIMSlotContentService } from '../interfaces/IOIMSlotContentService';

export function peekOIMColumnGroupValue<TSlot extends TOIMSlot>(
    slotContentService: IOIMSlotContentService<TSlot>, slot: TSlot, columnNames: readonly string[],
): unknown[] {
    const columnValues: unknown[] = new Array(columnNames.length);
    for (let i = 0; i < columnNames.length; i++) columnValues[i] = slotContentService.peekColumnValue(slot, columnNames[i]);
    return columnValues;
}
