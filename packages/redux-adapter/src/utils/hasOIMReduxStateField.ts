export function hasOIMReduxStateField(state: unknown, fieldName: string): boolean {
    return typeof state === 'object' && state !== null && fieldName in state;
}
