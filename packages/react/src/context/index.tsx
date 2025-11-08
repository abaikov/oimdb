import * as React from 'react';
import { createContext, useContext, ReactNode } from 'react';
import { OIMRICollection } from '@oimdb/core';

export type CollectionsDictionary = Record<
    string,
    OIMRICollection<object, string, string, string, never, never>
>;

export type OIMContextValue<
    T extends CollectionsDictionary = CollectionsDictionary,
> = T | null;

export const OIMRICollectionsContext = createContext<OIMContextValue>(null);

export function createOIMCollectionsContext<
    T extends CollectionsDictionary,
>(): React.Context<OIMContextValue<T>> {
    return createContext<OIMContextValue<T>>(null);
}

export interface OIMRICollectionsProviderProps<
    T extends CollectionsDictionary,
> {
    collections: T;
    children: ReactNode;
    context?: React.Context<OIMContextValue<T>>;
}

export function OIMRICollectionsProvider<T extends CollectionsDictionary>({
    collections,
    children,
    context = OIMRICollectionsContext as React.Context<OIMContextValue<T>>,
}: OIMRICollectionsProviderProps<T>) {
    const Provider = context.Provider;
    return <Provider value={collections}>{children}</Provider>;
}

export function useOIMCollectionsContext<
    T extends CollectionsDictionary = CollectionsDictionary,
>(context?: React.Context<OIMContextValue<T>>): T {
    const contextToUse =
        context ||
        (OIMRICollectionsContext as React.Context<OIMContextValue<T>>);
    const collections = useContext(contextToUse);
    if (!collections) {
        throw new Error(
            'useOIMCollectionsContext must be used within an OIMRICollectionsProvider'
        );
    }
    return collections as T;
}
