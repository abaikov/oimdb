import { OIMContentChangeListenerService } from '@oimdb/core';
import type {
    IOIMContentChangeListener, TOIMDefaultSlotStore, TOIMDisposer, TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';
import { OIMPersistRecordSourceCollectionWriteDriven } from './OIMPersistRecordSourceCollectionWriteDriven';

export class OIMPersistRecordSourceCollectionChangeDriven<
    TKey extends TOIMStoreKey, TEntity extends object, TStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
> extends OIMPersistRecordSourceCollectionWriteDriven<TKey, TEntity, TStore> {
    public override subscribeEntitySlotChanged(
        onEntitySlotChanged: (entitySlot: TOIMEntitySlot<TEntity, TKey>) => void,
    ): TOIMDisposer {
        const entityStoreSlot = this.entityStoreSlot;
        const contentChangeListener: IOIMContentChangeListener<TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>> = {
            onContentChanged: entitySlot => { onEntitySlotChanged(entitySlot); },
            onContentChangedMany: entitySlotQueue => {
                const entitySlotCount = entitySlotQueue.getEntryCount();
                for (let i = 0; i < entitySlotCount; i++) onEntitySlotChanged(entitySlotQueue.getEntryAt(i));
            },
        };
        const writtenDisposer = super.subscribeEntitySlotChanged(onEntitySlotChanged);
        const contentChangeListenerService = OIMContentChangeListenerService.INSTANCE;
        contentChangeListenerService.addContentChangeListener(entityStoreSlot, contentChangeListener, undefined);
        return () => {
            writtenDisposer();
            contentChangeListenerService.removeContentChangeListener(entityStoreSlot, contentChangeListener);
        };
    }
}
