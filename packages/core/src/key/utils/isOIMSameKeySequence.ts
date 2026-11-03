import { isOIMSameValueZero } from '../../slot/utils/isOIMSameValueZero';

export function isOIMSameKeySequence<TKey>(keys: readonly TKey[], otherKeys: readonly TKey[]): boolean {
    if (keys === otherKeys) return true;
    if (keys.length !== otherKeys.length) return false;
    for (let i = 0; i < keys.length; i++) {
        if (!isOIMSameValueZero(keys[i], otherKeys[i])) return false;
    }
    return true;
}
