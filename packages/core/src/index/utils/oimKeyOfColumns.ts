export function oimKeyOfColumns<TKey, TEntity extends object>(columns: readonly string[]): (entity: TEntity) => TKey {
    if (columns.length === 1) {
        const column = columns[0];
        return entity => (entity as Record<string, unknown>)[column] as TKey;
    }
    return (entity) => {
        const key: unknown[] = new Array(columns.length);
        for (let i = 0; i < columns.length; i++) key[i] = (entity as Record<string, unknown>)[columns[i]];
        return key as TKey;
    };
}
