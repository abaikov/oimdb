export function oimClearDepartedEntityColumns(
    prevColumns: Record<string, unknown>,
    prevEntity: Record<string, unknown>,
    entity: object,
    patchedTarget: Record<string, unknown> | undefined,
    changedColumnNames: string[] | undefined,
    targetOf: (entity: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | undefined {
    let target = patchedTarget;
    for (const name in prevColumns) {
        if (Object.prototype.hasOwnProperty.call(entity, name)) continue;
        if (prevColumns[name] === undefined) continue;
        (target ??= targetOf(prevEntity))[name] = undefined;
        if (changedColumnNames !== undefined) changedColumnNames.push(name);
    }
    return target;
}
