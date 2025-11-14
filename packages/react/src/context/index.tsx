import * as React from 'react';
import { createContext, useContext, ReactNode } from 'react';
import { OIMRICollection } from '@oimdb/core';

// Simplified type that accepts any OIMRICollection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CollectionsDictionary = Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OIMRICollection<any, any, any, any>
>;

export type OIMContextValue<
    T extends CollectionsDictionary = CollectionsDictionary,
> = T;

export const OIMRICollectionsContext = createContext<OIMContextValue>(
    {} as CollectionsDictionary
);

export function createOIMCollectionsContext<
    T extends CollectionsDictionary = CollectionsDictionary,
>(): React.Context<OIMContextValue<T>> {
    return createContext<OIMContextValue<T>>({} as T);
}

export interface OIMRICollectionsProviderProps<
    T extends CollectionsDictionary = CollectionsDictionary,
> {
    collections: T;
    children: ReactNode;
    context?: React.Context<OIMContextValue<T>>;
}

export function OIMRICollectionsProvider<
    T extends CollectionsDictionary = CollectionsDictionary,
>({ collections, children, context }: OIMRICollectionsProviderProps<T>) {
    const ContextToUse = context || OIMRICollectionsContext;
    return (
        <ContextToUse.Provider value={collections}>
            {children}
        </ContextToUse.Provider>
    );
}

export function useOIMCollectionsContext<
    T extends CollectionsDictionary = CollectionsDictionary,
>(context?: React.Context<OIMContextValue<T>>): T {
    const contextToUse = (context || OIMRICollectionsContext) as React.Context<
        OIMContextValue<T>
    >;
    const collections = useContext(contextToUse);
    if (!collections || Object.keys(collections).length === 0) {
        throw new Error(
            'useOIMCollectionsContext must be used within an OIMRICollectionsProvider'
        );
    }
    return collections as T;
}
