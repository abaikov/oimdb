export function oimFillEntitiesLengthMismatchError(collectionName: string, keyCount: number, contentCount: number): Error {
    return new Error(
        `${collectionName}.fillEntities: ${keyCount} keys against ${contentCount} contents. The `
        + 'two run in step — the content at a position is filed under the key at that same '
        + 'position — so lists of different lengths name either a key with nothing to file or '
        + 'a content with nowhere to go, and which of the two it is cannot be guessed.',
    );
}
