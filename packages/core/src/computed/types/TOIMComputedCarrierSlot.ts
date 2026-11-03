import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';
import type { TOIMColumnName } from '../../column/types/TOIMColumnName';
import type { TOIMColumnGroup } from '../../column/types/TOIMColumnGroup';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';

export type TOIMComputedCarrierSlot<
    TValue = unknown, TSourceTracker extends OIMSourceTracker | undefined = undefined, TColumnName extends string = TOIMColumnName<TValue>,
> = TOIMComputedContentSlot<TValue, TSourceTracker> & {
    getColumnSlot(columnName: TColumnName): TOIMComputedColumnSlot<TSourceTracker>;
    holdColumnSlot(columnName: TColumnName): TOIMComputedColumnSlot<TSourceTracker>;
    getAnyColumnSlot(): TOIMComputedColumnSlot<TSourceTracker>;
    holdAnyColumnSlot(): TOIMComputedColumnSlot<TSourceTracker>;
    getColumnGroupSlot(columnGroup: TOIMColumnGroup<TColumnName>): TOIMComputedColumnSlot<TSourceTracker>;
    holdColumnGroupSlot(columnGroup: TOIMColumnGroup<TColumnName>): TOIMComputedColumnSlot<TSourceTracker>;
    watch(body: (value: TValue) => void, columnNames?: readonly [TColumnName, ...TColumnName[]]): TOIMDisposer;
};
