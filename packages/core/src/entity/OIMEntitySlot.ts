import { OIM_ACTIVE_SOURCE_TRACKER } from '../computed/constants/OIM_ACTIVE_SOURCE_TRACKER';
import { OIMSlot } from '../slot/OIMSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMColumnName } from '../column/types/TOIMColumnName';
import type { OIMEntityContentService } from './OIMEntityContentService';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { TOIMEntitySlotOwnerService } from './types/TOIMEntitySlotOwnerService';
import type { TOIMDisposer } from '../schedule/types/TOIMDisposer';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { createOIMEffectDisposer } from '../effect/utils/createOIMEffectDisposer';
import { createOIMColumnGroup } from '../column/utils/createOIMColumnGroup';

export class OIMEntitySlot<
    TEntity extends object = object, TKey extends NonNullable<unknown> = NonNullable<unknown>, TColumnName extends TOIMColumnName<TEntity> = TOIMColumnName<TEntity>,
> extends OIMSlot {
    public key: TKey;

    public content: TEntity | undefined;

    public indexKeys: unknown[] | undefined;

    public constructor(key: TKey, owner: IOIMSlotOwner, storeSlot: TOIMStoreSlot) {
        super(owner, storeSlot);
        this.key = key;
        this.content = undefined;
        this.indexKeys = undefined;
    }

    public get entity(): TEntity | undefined {
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceSlot(this);
        return this.content;
    }

    public getEntity(columnGroup: TOIMColumnGroup): TEntity | undefined {
        OIM_ACTIVE_SOURCE_TRACKER.sourceTracker?.trackSourceSlot(this, columnGroup);
        return this.content;
    }

    public writeSlotContent(entity: TEntity): boolean {
        return this.entityContentService().writeSlotContent(this, entity);
    }

    public updateEntity(patch: Partial<TEntity>): this {
        return this.entityContentService().updateEntity(this, patch);
    }

    public updateEntityColumn<TColumn extends keyof TEntity & string>(columnName: TColumn, value: TEntity[TColumn]): this {
        return this.entityContentService().updateEntityColumn(this, columnName, value);
    }

    public deleteEntityColumns(columnNames: readonly TOIMColumnName<TEntity>[]): this {
        return this.entityContentService().deleteEntityColumns(this, columnNames);
    }

    public markEntityChanged(changedColumns?: readonly (keyof TEntity & string)[]): void {
        this.entityContentService().markEntityChanged(this, changedColumns);
    }

    public clearSlotContent(): void {
        this.entityContentService().clearSlotContent(this);
    }

    public getColumnSlot(columnName: TColumnName): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.getColumnSlot(this, columnName);
    }

    public holdColumnSlot(columnName: TColumnName): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.holdColumnSlot(this, columnName);
    }

    public getAnyColumnSlot(): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.getAnyColumnSlot(this);
    }

    public holdAnyColumnSlot(): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.holdAnyColumnSlot(this);
    }

    public getColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.getColumnGroupSlot(this, columnGroup);
    }

    public holdColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.holdColumnGroupSlot(this, columnGroup);
    }

    public watch(body: (entity: TEntity | undefined) => void, columnNames?: readonly [TColumnName, ...TColumnName[]]): TOIMDisposer {
        const sourceSlot: TOIMSlot = columnNames === undefined ? this
            : columnNames.length === 1 ? this.getColumnSlot(columnNames[0]) : this.getColumnGroupSlot(createOIMColumnGroup(columnNames));
        return createOIMEffectDisposer({ defaultChannelSlot: this.storeSlot.channelSlot }, () => { body(this.content); }, [sourceSlot]);
    }

    private entitySlotOwnerService(): TOIMEntitySlotOwnerService<TEntity, TOIMEntitySlot<TEntity, TKey>, unknown, TColumnName> {
        return this.owner as TOIMEntitySlotOwnerService<TEntity, TOIMEntitySlot<TEntity, TKey>, unknown, TColumnName>;
    }

    private entityContentService(): OIMEntityContentService<TEntity, TKey, TColumnName> {
        return this.entitySlotOwnerService().slotContentService as OIMEntityContentService<TEntity, TKey, TColumnName>;
    }
}
