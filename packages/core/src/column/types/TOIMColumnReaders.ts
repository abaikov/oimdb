import type { TOIMColumnGroup } from './TOIMColumnGroup';

export type TOIMColumnReaders = {
    columnSlotCount: number;
    readonly columnGroups: TOIMColumnGroup[];
};
