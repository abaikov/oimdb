export function oimFillEntitiesKeyNamedTwiceError(collectionName: string): Error {
    return new Error(
        `${collectionName}.fillEntities: the pairs name one key more than once. Filing the second would `
        + 'take the identity the first is under and strand every effect on it, and nothing could '
        + 'reach the stranded one again. The collection is left as fillEntities found it. Use '
        + '`upsertEntity` per entry, which asks.',
    );
}
