import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../../column/types/TOIMColumnGroup';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMEntityColumnName } from './TOIMEntityColumnName';

export type TOIMEntityContentSlot<TEntity extends object = object> = TOIMSlot & {
    readonly entity: TEntity | undefined;
    readEntity(columnGroup: TOIMColumnGroup): TEntity | undefined;
    readonly data: unknown[] | undefined;
    writeSlotContent(entity: TEntity): boolean;
    updateEntity(patch: Partial<TEntity>): TOIMEntityContentSlot<TEntity>;
    updateEntityColumn<TColumn extends keyof TEntity & string>(columnName: TColumn, value: TEntity[TColumn]): TOIMEntityContentSlot<TEntity>;
    deleteEntityColumns(columnNames: readonly TOIMEntityColumnName<TEntity>[]): TOIMEntityContentSlot<TEntity>;
    markEntityChanged(changedColumns?: readonly (keyof TEntity & string)[]): void;
    clearSlotContent(): void;
    getColumn(columnName: keyof TEntity & string): TOIMColumnSlot;
    holdColumn(columnName: keyof TEntity & string): TOIMColumnSlot;
    getAnyColumn(): TOIMColumnSlot;
    holdAnyColumn(): TOIMColumnSlot;
    getColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMColumnSlot;
    holdColumnGroup(columnGroup: TOIMColumnGroup): TOIMColumnSlot;
    holdSlot(): void;
    unholdSlot(): void;
};
