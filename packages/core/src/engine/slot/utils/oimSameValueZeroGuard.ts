export function oimSameValueZeroGuard(prevValue: unknown, nextValue: unknown): boolean {
    return prevValue === nextValue || (prevValue !== prevValue && nextValue !== nextValue);
}
