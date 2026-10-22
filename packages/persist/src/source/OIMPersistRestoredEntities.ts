import { oimHaveSameColumns } from './utils/oimHaveSameColumns';

export class OIMPersistRestoredEntities<TKey, TEntity extends object> {
    private readonly restoredEntityByKey = new Map<TKey, { readonly entity: TEntity | undefined }>();

    public rememberRestoredEntity(key: TKey, entity: TEntity | undefined): void {
        this.restoredEntityByKey.set(key, { entity: entity === undefined ? undefined : { ...entity } });
    }

    public isRestoredEntity(key: TKey, entity: TEntity | undefined): boolean {
        const restoredEntityByKey = this.restoredEntityByKey;
        const restored = restoredEntityByKey.get(key);
        if (restored === undefined) return false;
        const restoredEntity = restored.entity;
        const isRestored = restoredEntity === undefined
            ? entity === undefined
            : entity !== undefined && oimHaveSameColumns(restoredEntity, entity);
        if (!isRestored) restoredEntityByKey.delete(key);
        return isRestored;
    }

    public takeRestoredDeletion(key: TKey): boolean {
        const restoredEntityByKey = this.restoredEntityByKey;
        const restored = restoredEntityByKey.get(key);
        if (restored === undefined) return false;
        restoredEntityByKey.delete(key);
        return restored.entity === undefined;
    }
}
