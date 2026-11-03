import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMColumnGroup } from '../../column/types/TOIMColumnGroup';
import type { TOIMColumnSlot } from '../../column/types/TOIMColumnSlot';
import type { TOIMColumnName } from '../../column/types/TOIMColumnName';

export type TOIMEntityContentSlot<TEntity extends object = object, TColumnName extends TOIMColumnName<TEntity> = TOIMColumnName<TEntity>> = TOIMSlot & {
    readonly entity: TEntity | undefined;
    getEntity(columnGroup: TOIMColumnGroup): TEntity | undefined;
    writeSlotContent(entity: TEntity): boolean;
    updateEntity(patch: Partial<TEntity>): TOIMEntityContentSlot<TEntity>;
    updateEntityColumn<TColumn extends keyof TEntity & string>(columnName: TColumn, value: TEntity[TColumn]): TOIMEntityContentSlot<TEntity>;
    deleteEntityColumns(columnNames: readonly TOIMColumnName<TEntity>[]): TOIMEntityContentSlot<TEntity>;
    markEntityChanged(changedColumns?: readonly (keyof TEntity & string)[]): void;
    clearSlotContent(): void;
    getColumnSlot(columnName: TColumnName): TOIMColumnSlot;
    holdColumnSlot(columnName: TColumnName): TOIMColumnSlot;
    getAnyColumnSlot(): TOIMColumnSlot;
    holdAnyColumnSlot(): TOIMColumnSlot;
    getColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMColumnSlot;
    holdColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMColumnSlot;
    holdSlot(): void;
    unholdSlot(): void;
    watch(body: (entity: TEntity | undefined) => void, columnNames?: readonly [TColumnName, ...TColumnName[]]): TOIMDisposer;
};
