export function isOIMSameColumnValue(prevColumnValue: unknown, nextColumnValue: unknown): boolean {
    if (Object.is(prevColumnValue, nextColumnValue)) return true;
    if (!Array.isArray(prevColumnValue) || !Array.isArray(nextColumnValue)) return false;
    if (prevColumnValue.length !== nextColumnValue.length) return false;
    for (let i = 0; i < nextColumnValue.length; i++) {
        if (!isOIMSameColumnValue(prevColumnValue[i], nextColumnValue[i])) return false;
    }
    return true;
}
