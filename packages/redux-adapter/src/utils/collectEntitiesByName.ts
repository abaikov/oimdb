// THE DOOR OUT OF THE STRING WORLD: a diff's keys go in, ENTITIES come out, so
// no site is left holding a key it might hand to the engine.
export function collectEntitiesByName<TEntity extends object>(
    entities: object,
    names: Iterable<string>
): TEntity[] {
    const byName = entities as Record<string, TEntity | undefined>;
    const found: TEntity[] = [];
    for (const name of names) {
        const entity = byName[name];
        if (entity !== undefined) found.push(entity);
    }
    return found;
}
