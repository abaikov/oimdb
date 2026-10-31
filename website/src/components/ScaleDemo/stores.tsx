import type { ComponentType, ReactNode } from 'react';
import { create } from 'zustand';
import { OIMDB, createOIMSlotCollectionStoreAggregate, createOIMEntityContentService, type TOIMEntitySlot, type TOIMStoreKey } from '@oimdb/core';
import { OIMDBProvider, useOIMEntity } from '@oimdb/react';

export type TScaleItem = { id: string; name: string; price: number; qty: number };

export type TScaleChange = { index: number; price: number; qty: number };

export type TScaleRowProps = { id: string; onRender: () => void; render: (item: TScaleItem) => ReactNode };

export type TScaleStore = {
    load: (items: readonly TScaleItem[]) => void;
    write: (changes: readonly TScaleChange[]) => void;
    Row: ComponentType<TScaleRowProps>;
    Provider: ComponentType<{ children: ReactNode }>;
    dispose: () => void;
};

export function createOIMScaleStore(): TScaleStore {
    const db = new OIMDB({ channelScheduler: (flush) => queueMicrotask(flush) });
    const items = createOIMSlotCollectionStoreAggregate(db, { slotContentService: createOIMEntityContentService<TScaleItem>() });
    const slots: TOIMEntitySlot<TScaleItem, TOIMStoreKey>[] = [];
    function Row({ id, onRender, render }: TScaleRowProps) {
        onRender();
        const item = useOIMEntity(items.storeSlot, id);
        return item === undefined ? null : render(item);
    }
    return {
        load(loaded) {
            for (const item of loaded) slots.push(items.writeSlotContentByKey(item.id, item));
            db.flush();
        },
        write(changes) {
            for (const change of changes) slots[change.index].updateEntity({ price: change.price, qty: change.qty });
            db.flush();
        },
        Row,
        Provider: ({ children }) => <OIMDBProvider db={db}><>{children}</></OIMDBProvider>,
        dispose() {
            slots.length = 0;
        },
    };
}

export function createZustandScaleStore(): TScaleStore {
    const useItems = create<{ ids: string[]; entities: Record<string, TScaleItem> }>(() => ({ ids: [], entities: {} }));
    function Row({ id, onRender, render }: TScaleRowProps) {
        onRender();
        const item = useItems((state) => state.entities[id]);
        return item === undefined ? null : render(item);
    }
    return {
        load(loaded) {
            const entities: Record<string, TScaleItem> = {};
            for (const item of loaded) entities[item.id] = item;
            useItems.setState({ ids: loaded.map((item) => item.id), entities });
        },
        write(changes) {
            useItems.setState((state) => {
                const entities = { ...state.entities };
                for (const change of changes) {
                    const id = state.ids[change.index];
                    entities[id] = { ...entities[id], price: change.price, qty: change.qty };
                }
                return { entities };
            });
        },
        Row,
        Provider: ({ children }) => children,
        dispose() {
            useItems.setState({ ids: [], entities: {} });
        },
    };
}
