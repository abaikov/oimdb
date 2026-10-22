export function oimHasReduxStateField(state: unknown, fieldName: string): boolean {
    return typeof state === 'object' && state !== null && fieldName in state;
}
