import type { TOIMKey } from './TOIMKey';
import type { OIMCollectionStore } from '../abstract/OIMCollectionStore';
import type { TOIMPkSelector } from './TOIMPkSelector';
import type { TOIMEntityUpdater } from './TOIMEntityUpdater';
import type { OIMSlotWriter } from '../core/OIMSlotWriter';

export type TOIMCollectionOptions<
    TEntity extends object,
    TPk extends TOIMKey,
> = {
    selectPk?: TOIMPkSelector<TEntity, TPk>;
    /**
     * Backing store. Defaults to `OIMCollectionStoreMapDriven` (native-`Map`,
     * primitive PKs). For a composite PK path, pass
     * `new OIMCollectionStoreTrieDriven()`.
     */
    store?: OIMCollectionStore<TEntity, TPk>;
    updateEntity?: TOIMEntityUpdater<TEntity>;
    /**
     * How a write lands on a slot, and whether it is worth publishing. Omit for
     * the plain writer (merge, always publish). Supply
     * `OIMSlotWriterFieldMasked` to suppress writes that change nothing and to
     * record which fields did change — see that class for the trade.
     */
    slotWriter?: OIMSlotWriter<TEntity, TPk>;
};
