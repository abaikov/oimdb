export function copyOIMEntity(entity: object): Record<string, unknown> {
    return { ...entity };
}
