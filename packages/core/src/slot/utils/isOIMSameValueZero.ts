export function isOIMSameValueZero(prevValue: unknown, nextValue: unknown): boolean {
    return prevValue === nextValue || (prevValue !== prevValue && nextValue !== nextValue);
}
