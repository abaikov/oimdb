import { OIMSlot } from '../slot/OIMSlot';
import type { IOIMSlotOwner } from '../slot/interfaces/IOIMSlotOwner';
import { OIMSourceTracker } from '../computed/OIMSourceTracker';
import type { TOIMStoreSlot } from '../slot/types/TOIMStoreSlot';
import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { TOIMEntityColumnName } from './types/TOIMEntityColumnName';
import type { OIMEntityContentService } from './OIMEntityContentService';
import type { TOIMEntitySlot } from './types/TOIMEntitySlot';
import type { TOIMEntitySlotOwnerService } from './types/TOIMEntitySlotOwnerService';

export class OIMEntitySlot<TEntity extends object = object, TKey extends NonNullable<unknown> = NonNullable<unknown>> extends OIMSlot {
    public key: TKey;

    public content: TEntity | undefined;

    public data: unknown[] | undefined;

    public indexKeys: unknown[] | undefined;

    public constructor(key: TKey, owner: IOIMSlotOwner, storeSlot: TOIMStoreSlot) {
        super(owner, storeSlot);
        this.key = key;
        this.content = undefined;
        this.data = undefined;
        this.indexKeys = undefined;
    }

    public get entity(): TEntity | undefined {
        OIMSourceTracker.activeSourceTracker?.trackSourceSlot(this);
        return this.content;
    }

    public readEntity(columnGroup: TOIMColumnGroup): TEntity | undefined {
        OIMSourceTracker.activeSourceTracker?.trackSourceSlot(this, columnGroup);
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

    public deleteEntityColumns(columnNames: readonly TOIMEntityColumnName<TEntity>[]): this {
        return this.entityContentService().deleteEntityColumns(this, columnNames);
    }

    public markEntityChanged(changedColumns?: readonly (keyof TEntity & string)[]): void {
        this.entityContentService().markEntityChanged(this, changedColumns);
    }

    public clearSlotContent(): void {
        this.entityContentService().clearSlotContent(this);
    }

    public getColumn(columnName: keyof TEntity & string): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.getColumn(this, columnName);
    }

    public holdColumn(columnName: keyof TEntity & string): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.holdColumn(this, columnName);
    }

    public getAnyColumn(): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.getAnyColumn(this);
    }

    public holdAnyColumn(): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.holdAnyColumn(this);
    }

    public getColumnGroupSlot(columnGroup: TOIMColumnGroup): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.getColumnGroupSlot(this, columnGroup);
    }

    public holdColumnGroup(columnGroup: TOIMColumnGroup): TOIMColumnSlot {
        return this.entitySlotOwnerService().columnSlotService.holdColumnGroup(this, columnGroup);
    }

    private entitySlotOwnerService(): TOIMEntitySlotOwnerService<TEntity, TOIMEntitySlot<TEntity, TKey>, unknown, keyof TEntity & string> {
        return this.owner as TOIMEntitySlotOwnerService<TEntity, TOIMEntitySlot<TEntity, TKey>, unknown, keyof TEntity & string>;
    }

    private entityContentService(): OIMEntityContentService<TEntity, TKey, keyof TEntity & string> {
        return this.entitySlotOwnerService().slotContentService as OIMEntityContentService<TEntity, TKey, keyof TEntity & string>;
    }
}
