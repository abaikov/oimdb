import * as React from 'react';
import { createContext, useContext, ReactNode } from 'react';
import { OIMReactiveCollection } from '@oimdb/core';

// Simplified type that accepts any reactive collection.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CollectionsDictionary = Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    OIMReactiveCollection<any, any>
>;

export type OIMContextValue<
    T extends CollectionsDictionary = CollectionsDictionary,
> = T;

export const OIMCollectionsContext = createContext<OIMContextValue>(
    {} as CollectionsDictionary
);

export function createOIMCollectionsContext<
    T extends CollectionsDictionary = CollectionsDictionary,
>(): React.Context<OIMContextValue<T>> {
    return createContext<OIMContextValue<T>>({} as T);
}

export interface OIMCollectionsProviderProps<
    T extends CollectionsDictionary = CollectionsDictionary,
> {
    collections: T;
    children: ReactNode;
    context?: React.Context<OIMContextValue<T>>;
}

export function OIMCollectionsProvider<
    T extends CollectionsDictionary = CollectionsDictionary,
>({ collections, children, context }: OIMCollectionsProviderProps<T>) {
    const ContextToUse = context || OIMCollectionsContext;
    return (
        <ContextToUse.Provider value={collections}>
            {children}
        </ContextToUse.Provider>
    );
}

export function useOIMCollectionsContext<
    T extends CollectionsDictionary = CollectionsDictionary,
>(context?: React.Context<OIMContextValue<T>>): T {
    const contextToUse = (context || OIMCollectionsContext) as React.Context<
        OIMContextValue<T>
    >;
    const collections = useContext(contextToUse);
    if (!collections || Object.keys(collections).length === 0) {
        throw new Error(
            'useOIMCollectionsContext must be used within an OIMCollectionsProvider'
        );
    }
    return collections as T;
}
