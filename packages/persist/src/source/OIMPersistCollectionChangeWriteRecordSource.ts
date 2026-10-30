import { OIMSlotContentChangeListenerService } from '@oimdb/core';
import type {
    IOIMSlotContentChangeListener, TOIMDefaultSlotStore, TOIMDisposer, TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';
import { OIMPersistCollectionWriteRecordSource } from './OIMPersistCollectionWriteRecordSource';

export class OIMPersistCollectionChangeWriteRecordSource<
    TKey extends TOIMStoreKey, TEntity extends object, TStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
> extends OIMPersistCollectionWriteRecordSource<TKey, TEntity, TStore> {
    public override subscribeEntitySlotChanged(
        onEntitySlotChanged: (entitySlot: TOIMEntitySlot<TEntity, TKey>) => void,
    ): TOIMDisposer {
        const entityStoreSlot = this.entityStoreSlot;
        const contentChangeListener: IOIMSlotContentChangeListener<TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>> = {
            onContentChanged: entitySlot => { onEntitySlotChanged(entitySlot); },
            onManyContentsChanged: entitySlotQueue => {
                const entitySlotCount = entitySlotQueue.getEntryCount();
                for (let i = 0; i < entitySlotCount; i++) onEntitySlotChanged(entitySlotQueue.getEntryAt(i));
            },
        };
        const writtenDisposer = super.subscribeEntitySlotChanged(onEntitySlotChanged);
        const contentChangeListenerService = OIMSlotContentChangeListenerService.INSTANCE;
        contentChangeListenerService.addContentChangeListener(entityStoreSlot, contentChangeListener, undefined);
        return () => {
            writtenDisposer();
            contentChangeListenerService.removeContentChangeListener(entityStoreSlot, contentChangeListener);
        };
    }
}
