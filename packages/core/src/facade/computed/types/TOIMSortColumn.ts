import type { TOIMSortableColumnName } from './TOIMSortableColumnName';

export type TOIMSortColumn<TEntity extends object> = {
    column: TOIMSortableColumnName<TEntity>;
    direction: 'asc' | 'desc';
};
