export type TOIMBucketCollectionFactoryArguments<TKey, TBucketSlot, TStore, TOptions extends { bucketSlotStoreService?: unknown }> =
    [TKey] extends [readonly unknown[]]
        ? [bucketCollectionFactoryOptions: TOptions & Required<Pick<TOptions, 'bucketSlotStoreService'>>]
        : [TStore] extends [Map<TKey, TBucketSlot>]
            ? [bucketCollectionFactoryOptions?: TOptions]
            : [bucketCollectionFactoryOptions: TOptions & Required<Pick<TOptions, 'bucketSlotStoreService'>>];
