import type { TOIMSortableColumnName } from './TOIMSortableColumnName';

export type TOIMSortColumn<TEntity extends object> = {
    columnName: TOIMSortableColumnName<TEntity>;
    direction: 'asc' | 'desc';
};
