import * as React from 'react';
import { createContext, useContext, ReactNode } from 'react';
import { OIMRICollection, TOIMPk } from '@oimdb/core';

// Base type for any OIMRICollection regardless of its specific generics
export type AnyOIMRICollection = OIMRICollection<
    object,
    TOIMPk,
    string,
    TOIMPk,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    any
>;

// Type for a collections dictionary with proper generic constraints
export type CollectionsDictionary = Record<string, AnyOIMRICollection>;

// More specific type that preserves the exact types of each collection
export type TypedCollectionsDictionary<T extends CollectionsDictionary> = T;

// Context type that can handle both typed and untyped dictionaries
export type OIMContextValue<
    T extends CollectionsDictionary = CollectionsDictionary,
> = T | null;

// Create the context with a generic type parameter
export const OIMRICollectionsContext = createContext<OIMContextValue>(null);

// Function to create a custom collections context
export function createOIMCollectionsContext<
    T extends CollectionsDictionary,
>(): React.Context<OIMContextValue<T>> {
    return createContext<OIMContextValue<T>>(null);
}

// Provider component props with excellent TypeScript support
export interface OIMRICollectionsProviderProps<
    T extends CollectionsDictionary,
> {
    collections: T;
    children: ReactNode;
    context?: React.Context<OIMContextValue<T>>;
}

// Type-safe provider component
export function OIMRICollectionsProvider<T extends CollectionsDictionary>({
    collections,
    children,
    context = OIMRICollectionsContext as React.Context<OIMContextValue<T>>,
}: OIMRICollectionsProviderProps<T>) {
    const Provider = context.Provider;
    return <Provider value={collections}>{children}</Provider>;
}

// Hook to access the collections context
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

// Helper type to extract entity type from OIMRICollection
export type ExtractEntityType<T> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends OIMRICollection<infer E, TOIMPk, string, TOIMPk, any, any>
        ? E
        : never;

// Helper type to extract primary key type from OIMRICollection
export type ExtractPkType<T> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends OIMRICollection<object, infer P, string, TOIMPk, any, any>
        ? P
        : never;

// Helper type to extract index name type from OIMRICollection
export type ExtractIndexNameType<T> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends OIMRICollection<object, TOIMPk, infer IN, TOIMPk, any, any>
        ? IN
        : never;

// Helper type to extract index key type from OIMRICollection
export type ExtractIndexKeyType<T> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends OIMRICollection<object, TOIMPk, string, infer IK, any, any>
        ? IK
        : never;

// Utility type to create a collections dictionary with proper typing
export type CreateCollectionsDictionary<
    T extends Record<string, AnyOIMRICollection>,
> = {
    [K in keyof T]: T[K];
};

// Advanced helper types for more specific extraction
export type ExtractCollectionSignature<T> =
    T extends OIMRICollection<
        infer E,
        infer P,
        infer IN,
        infer IK,
        infer I,
        infer RI
    >
        ? {
              entity: E;
              pk: P;
              indexName: IN;
              indexKey: IK;
              index: I;
              reactiveIndex: RI;
          }
        : never;

// Type to ensure a collection dictionary maintains exact types
export type StrictCollectionsDictionary<T> = {
    [K in keyof T]: T[K] extends OIMRICollection<
        infer E,
        infer P,
        infer IN,
        infer IK,
        infer I,
        infer RI
    >
        ? OIMRICollection<E, P, IN, IK, I, RI>
        : never;
};
