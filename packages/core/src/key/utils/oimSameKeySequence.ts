import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';

export function oimSameKeySequence<TKey>(keys: readonly TKey[], otherKeys: readonly TKey[]): boolean {
    if (keys === otherKeys) return true;
    if (keys.length !== otherKeys.length) return false;
    for (let i = 0; i < keys.length; i++) {
        if (!oimSameValueZeroGuard(keys[i], otherKeys[i])) return false;
    }
    return true;
}
