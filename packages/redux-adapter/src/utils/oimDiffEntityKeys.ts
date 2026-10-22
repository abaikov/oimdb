import type { TOIMReduxEntityKeysDiff } from '../types/TOIMReduxEntityKeysDiff';

// IT REPORTS STRINGS, because that is what the records hold — typing the result
// by the caller's key is a claim the runtime cannot keep, and a consumer that
// believes it writes to a `Map` address nothing is filed at.
export function oimDiffEntityKeys(
    oldEntities: object,
    newEntities: object
): TOIMReduxEntityKeysDiff<string> {
    const oldByName = oldEntities as Record<string, unknown>;
    const newByName = newEntities as Record<string, unknown>;

    const added = new Set<string>();
    const updated = new Set<string>();
    const removed = new Set<string>();

    for (const key in newByName) {
        if (Object.prototype.hasOwnProperty.call(newByName, key)) {
            if (!(key in oldByName)) {
                added.add(key);
            } else if (oldByName[key] !== newByName[key]) {
                updated.add(key);
            }
        }
    }

    for (const key in oldByName) {
        if (Object.prototype.hasOwnProperty.call(oldByName, key)) {
            if (!(key in newByName)) {
                removed.add(key);
            }
        }
    }

    const all = new Set<string>();
    for (const key of added) all.add(key);
    for (const key of updated) all.add(key);
    for (const key of removed) all.add(key);

    return { added, updated, removed, all };
}
