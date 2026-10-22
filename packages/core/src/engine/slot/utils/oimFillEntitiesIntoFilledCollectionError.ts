export function oimFillEntitiesIntoFilledCollectionError(collectionName: string): Error {
    return new Error(
        `${collectionName}.fillEntities: this collection already holds identities, and fillEntities files `
        + 'every key without asking whether it is taken — which would mint a second identity '
        + 'under a key that has one and strand every effect on the first. Use `upsertEntity` per '
        + 'entry, which asks; it is one hash more and correct at any moment.',
    );
}
