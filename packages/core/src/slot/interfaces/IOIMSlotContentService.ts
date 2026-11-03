import type { TOIMSlot } from '../types/TOIMSlot';

export interface IOIMSlotContentService<TSlot extends TOIMSlot> {
    isSlotEmpty(slot: TSlot): boolean;
    releaseSlotContent(slot: TSlot): void;
    peekColumnValue(slot: TSlot, columnName: string): unknown;
    peekColumnGroupValue(slot: TSlot, columnNames: readonly string[]): unknown;
    peekAnyColumnValue(slot: TSlot): unknown;
}
